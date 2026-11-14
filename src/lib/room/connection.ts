import { getSyncSocket } from "./socket";
import { WebRTCPeerManager } from "../webrc/manager";
import { ClockEstimator } from "../sync/clock";
import { evaluateSyncQuality } from "../sync/metrics";
import { nowEpochSeconds } from "../audio/context";
import { SYNC_PROBE_INTERVAL_MS } from "../config";
import { useAppStore, type AudioMeta } from "../../store/useAppStore";
import type { CommandMessage, PeerInfo, PlaybackStatus } from "../../types/room";

export interface RoomEvents {
  onPlaybackCommand: (peerId: string, command: CommandMessage) => void;
  onPeerPosition: (peerId: string, position: number, status: PlaybackStatus["status"]) => void;
  onAudioMeta: (meta: AudioMeta) => void;
  onPeerReady: (peerId: string) => void;
  onRoomClosed: () => void;
}

type SignalKind = "offer" | "answer" | "ice";

interface SignalPayload {
  kind?: string;
  peerId?: string;
  data?: unknown;
}

interface ServerPeer {
  id: string;
  name: string;
  isHost: boolean;
  role?: string;
}

const probeTimers = new Map<string, number>();
let manager: WebRTCPeerManager | null = null;
let estimator: ClockEstimator | null = null;
let socketBound = false;
let roomEvents: RoomEvents | null = null;
let hostToken: string | null = null;

export function getHostToken(): string | null {
  return hostToken;
}

const NULL_PEER_DEFAULTS = {
  volume: 0.85,
  muted: false,
  latencyOffsetMs: 0,
  connectionState: "disconnected" as const,
  live: false,
  role: "receiver" as const,
};

function upsertFromServer(peer: ServerPeer): PeerInfo {
  const existing = useAppStore.getState().peers[peer.id];
  const info: PeerInfo = {
    ...NULL_PEER_DEFAULTS,
    ...existing,
    id: peer.id,
    name: peer.name,
    isHost: peer.isHost,
    role: peer.isHost ? "host" : "receiver",
  };
  useAppStore.getState().upsertPeer(info);
  return info;
}

function hostSelfPeer(hostId: string): PeerInfo {
  return {
    id: hostId,
    name: "This device",
    role: "host",
    isHost: true,
    volume: 1,
    muted: false,
    latencyOffsetMs: 0,
    connectionState: "connected",
    live: true,
    lastSeen: Date.now(),
  };
}

function selfReceiverPeer(selfId: string): PeerInfo {
  return {
    id: selfId,
    name: "This device",
    role: "receiver",
    isHost: false,
    volume: 1,
    muted: false,
    latencyOffsetMs: 0,
    connectionState: "connected",
    live: true,
    lastSeen: Date.now(),
  };
}

function sendSignal(peerId: string, kind: SignalKind, data: unknown): void {
  const store = useAppStore.getState();
  if (!store.roomId || !store.selfPeerId) return;
  getSyncSocket().emit("signal", { roomId: store.roomId, from: store.selfPeerId, to: peerId, kind, data });
}

export function registerRoomEvents(next: RoomEvents | null): void {
  roomEvents = next;
}

function handleDataMessage(peerId: string, data: unknown): void {
  if (typeof data !== "object" || data === null) return;
  const message = data as {
    kind?: string;
    payload?: unknown;
    fromId?: string;
    t3?: number;
    echoT1?: number;
    position?: number;
    status?: PlaybackStatus["status"];
  };

  if (message.kind === "playback:command" && message.payload && typeof message.payload === "object") {
    roomEvents?.onPlaybackCommand(peerId, message.payload as CommandMessage);
    return;
  }

  if (message.kind === "position" && typeof message.position === "number") {
    roomEvents?.onPeerPosition(peerId, Number(message.position), message.status ?? "playing");
    return;
  }

  if (message.kind === "audio:meta" && message.payload && typeof message.payload === "object") {
    roomEvents?.onAudioMeta(message.payload as AudioMeta);
    return;
  }

  if (message.kind === "sync_probe" && message.payload && typeof (message.payload as { t1?: number }).t1 === "number") {
    const t1 = Number((message.payload as { t1: number }).t1);
    manager?.sendData(peerId, {
      kind: "sync_probe_reply",
      fromId: useAppStore.getState().selfPeerId ?? "",
      t3: nowEpochSeconds(),
      echoT1: t1,
    });
    return;
  }

  if (message.kind === "sync_probe_reply" && typeof message.t3 === "number" && typeof message.echoT1 === "number") {
    const sample = estimator?.receiveReply(peerId, Number(message.t3), Number(message.echoT1), nowEpochSeconds());
    if (!sample) return;
    const current = useAppStore.getState();
    const quality = evaluateSyncQuality({
      offsetSeconds: sample.offsetSeconds,
      delaySeconds: sample.delaySeconds,
      jitterSeconds: sample.jitterSeconds,
      packetLoss: current.sync.packetLoss,
    });
    current.setSync({
      ...current.sync,
      offsetSeconds: sample.offsetSeconds,
      delaySeconds: sample.delaySeconds,
      jitterSeconds: sample.jitterSeconds,
      quality,
      offsetSamples: sample.samples,
      delaySamples: sample.samples,
      rttSamples: sample.samples,
      updatedAt: Date.now(),
    });
  }
}

function startProbes(peerId: string): void {
  if (probeTimers.has(peerId)) return;
  const timer = window.setInterval(() => {
    const t1 = nowEpochSeconds();
    estimator?.sendProbe(peerId, t1);
    manager?.sendData(peerId, {
      kind: "sync_probe",
      fromId: useAppStore.getState().selfPeerId ?? "",
      payload: { t1 },
    });
  }, SYNC_PROBE_INTERVAL_MS);
  probeTimers.set(peerId, timer);
  const t1 = nowEpochSeconds();
  estimator?.sendProbe(peerId, t1);
  manager?.sendData(peerId, { kind: "sync_probe", fromId: useAppStore.getState().selfPeerId ?? "", payload: { t1 } });
}

function stopProbes(peerId?: string): void {
  if (peerId) {
    const timer = probeTimers.get(peerId);
    if (timer !== undefined) {
      window.clearInterval(timer);
      probeTimers.delete(peerId);
    }
    return;
  }
  for (const timer of probeTimers.values()) {
    window.clearInterval(timer);
  }
  probeTimers.clear();
}

function handlePeerReady(peerId: string): void {
  startProbes(peerId);
  const state = useAppStore.getState();
  if (state.mode === "host") {
    roomEvents?.onPeerReady(peerId);
  }
}

export function getRoomManager(): WebRTCPeerManager {
  if (manager) return manager;
  estimator = new ClockEstimator();
  manager = new WebRTCPeerManager({
    onTrack: (peerId) => {
      const peer = useAppStore.getState().peers[peerId];
      if (peer) useAppStore.getState().upsertPeer({ ...peer, live: true, connectionState: "connected" });
    },
    onDataChannel: (peerId, channel) => {
      const onOpen = () => handlePeerReady(peerId);
      if (channel.readyState === "open") {
        onOpen();
      } else {
        channel.addEventListener("open", onOpen, { once: true });
      }
    },
    onConnectionStateChange: (peerId, state) => {
      const peer = useAppStore.getState().peers[peerId];
      if (!peer) return;
      const connectionState =
        state === "connected" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
      useAppStore.getState().upsertPeer({ ...peer, connectionState });
      if (state === "failed" || state === "closed" || state === "disconnected") {
        stopProbes(peerId);
      }
    },
    onIceCandidate: (peerId, candidate) => {
      sendSignal(peerId, "ice", candidate);
    },
    onDataMessage: (peerId, data) => {
      handleDataMessage(peerId, data);
    },
  });
  return manager;
}

export function getClockEstimator(): ClockEstimator {
  getRoomManager();
  if (!estimator) estimator = new ClockEstimator();
  return estimator;
}

async function createOfferTo(peerId: string): Promise<void> {
  const store = useAppStore.getState();
  if (store.mode !== "host") return;
  const effectiveManager = getRoomManager();
  try {
    const offer = await effectiveManager.createOffer(peerId);
    sendSignal(peerId, "offer", offer);
  } catch {
    store.setError("Failed to start a WebRTC session with a speaker.");
  }
}

async function acceptIncomingOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
  const effectiveManager = getRoomManager();
  try {
    await effectiveManager.acceptOffer(peerId, offer);
    const local = effectiveManager.getLocalDescription(peerId);
    if (local) sendSignal(peerId, "answer", local);
  } catch {
    useAppStore.getState().setError("Failed to accept the WebRTC session from the host.");
  }
}

function bindSocket(): void {
  if (socketBound) return;
  socketBound = true;
  const socket = getSyncSocket();

  socket.on("connect", () => {
    const state = useAppStore.getState();
    state.setConnectionStatus("connected");
    state.setSelfPeerId(socket.id ?? null);
    if (state.mode === "receiver" && state.roomId) {
      getRoomManager().closeAll();
      stopProbes();
      estimator?.clear();
      socket.emit("room:join", { roomId: state.roomId });
    }
  });

  socket.on("disconnect", () => {
    const state = useAppStore.getState();
    state.setConnectionStatus("disconnected");
    stopProbes();
    if (state.mode === "host" && state.roomId) {
      getRoomManager().closeAll();
      estimator?.clear();
      hostToken = null;
      state.setScreen("home");
      state.setMode(null);
      state.setRoom(null, "");
      state.setPlayback({ status: "stopped", position: 0 });
      state.setAudioStatus("idle");
      useAppStore.setState({ peers: {} });
      state.setError("Lost connection to the signaling server. The room was closed.");
    }
  });

  socket.on("room:created", (payload: { roomId: string; hostId: string; hostToken?: string; peers?: ServerPeer[] }) => {
    const store = useAppStore.getState();
    hostToken = payload.hostToken ?? null;
    store.setRoom(payload.roomId, payload.roomId);
    store.setMode("host");
    store.setSelfPeerId(payload.hostId);
    store.setError(null);
    useAppStore.setState({ peers: {} });
    store.upsertPeer(hostSelfPeer(payload.hostId));
    for (const peer of payload.peers ?? []) {
      if (peer.id === payload.hostId) continue;
      upsertFromServer(peer);
    }
  });

  socket.on("room:state", (payload: { roomId: string; peers?: ServerPeer[] }) => {
    const store = useAppStore.getState();
    const selfId = socket.id ?? store.selfPeerId;
    store.setRoom(payload.roomId, payload.roomId);
    store.setError(null);
    const nextPeers: Record<string, PeerInfo> = {};
    if (selfId) {
      nextPeers[selfId] = { ...selfReceiverPeer(selfId), ...store.peers[selfId] };
    }
    for (const peer of payload.peers ?? []) {
      const existing = store.peers[peer.id];
      nextPeers[peer.id] = {
        ...NULL_PEER_DEFAULTS,
        ...existing,
        id: peer.id,
        name: peer.name,
        isHost: peer.isHost,
        role: peer.isHost ? "host" : "receiver",
      };
    }
    useAppStore.setState({ peers: nextPeers });
    if (selfId) {
      store.setSelfPeerId(selfId);
    }
  });

  socket.on("peer:joined", (payload: { peer: ServerPeer }) => {
    const store = useAppStore.getState();
    upsertFromServer(payload.peer);
    if (store.mode === "host" && !payload.peer.isHost) {
      void createOfferTo(payload.peer.id);
    }
  });

  socket.on("peer:updated", (payload: { peer: ServerPeer }) => {
    upsertFromServer(payload.peer);
  });

  socket.on("peer:removed", (payload: { peerId: string }) => {
    stopProbes(payload.peerId);
    getRoomManager().close(payload.peerId);
    useAppStore.getState().removePeer(payload.peerId);
  });

  socket.on("room:closed", () => {
    if (!useAppStore.getState().roomId) return;
    roomEvents?.onRoomClosed();
    leaveRoom();
    useAppStore.getState().setError("The host ended the session.");
  });

  socket.on("error", (payload: { code?: string; message?: string }) => {
    const state = useAppStore.getState();
    state.setError(payload?.message ?? "Signaling server error.");
    if (payload?.code === "ROOM_NOT_FOUND" || (!state.roomId && state.mode === "receiver")) {
      state.setMode(null);
      state.setScreen("home");
    }
  });

  socket.on("signal", (payload: SignalPayload) => {
    const peerId = String(payload.peerId ?? "");
    if (!peerId || !payload.data) return;
    if (payload.kind === "offer") {
      void acceptIncomingOffer(peerId, payload.data as RTCSessionDescriptionInit);
    } else if (payload.kind === "answer") {
      void getRoomManager()
        .acceptAnswer(peerId, payload.data as RTCSessionDescriptionInit)
        .catch(() => undefined);
    } else if (payload.kind === "ice") {
      getRoomManager().addIceCandidate(peerId, payload.data as RTCIceCandidateInit);
    }
  });
}

export function ensureRoomConnection(): void {
  bindSocket();
  getRoomManager();
  const socket = getSyncSocket();
  if (!socket.connected) socket.connect();
}

export function createRoom(): void {
  ensureRoomConnection();
  const store = useAppStore.getState();
  if (store.roomId) {
    getSyncSocket().emit("room:leave", { roomId: store.roomId });
  }
  store.setMode("host");
  store.setScreen("room");
  store.setRoom(null, "");
  store.setConnectionStatus("connecting");
  store.setError(null);
  store.setPlayback({ status: "stopped", position: 0 });
  store.setAudioStatus("idle");
  store.setAudio(null);
  useAppStore.setState({ peers: {} });
  getSyncSocket().emit("room:create", { name: "Host device" });
}

export function joinRoom(roomId: string): void {
  ensureRoomConnection();
  const store = useAppStore.getState();
  if (store.roomId) {
    getSyncSocket().emit("room:leave", { roomId: store.roomId });
  }
  store.setMode("receiver");
  store.setScreen("room");
  store.setRoom(null, "");
  store.setConnectionStatus("connecting");
  store.setError(null);
  store.setPlayback({ status: "stopped", position: 0 });
  store.setAudioStatus("idle");
  store.setAudio(null);
  useAppStore.setState({ peers: {} });
  getSyncSocket().emit("room:join", { roomId });
}

export function leaveRoom(): void {
  const store = useAppStore.getState();
  if (store.roomId) {
    getSyncSocket().emit("room:leave", { roomId: store.roomId });
  }
  stopProbes();
  estimator?.clear();
  getRoomManager().closeAll();
  roomEvents = null;
  hostToken = null;
  store.setScreen("home");
  store.setRoom(null, "");
  store.setMode(null);
  store.setPlayback({ status: "stopped", position: 0 });
  store.setAudioStatus("idle");
  store.setAudio(null);
  useAppStore.setState({ peers: {}, error: null });
}

export function sendControl(peerId: string, data: unknown): void {
  getRoomManager().sendData(peerId, data);
}

export function broadcastToReceivers(data: unknown): void {
  const state = useAppStore.getState();
  for (const peer of Object.values(state.peers)) {
    if (peer.isHost) continue;
    getRoomManager().sendData(peer.id, data);
  }
}

export function sendAudioMeta(meta: AudioMeta): void {
  useAppStore.getState().setAudio(meta);
  broadcastToReceivers({ kind: "audio:meta", payload: meta });
}

export function disconnectSpeaker(peerId: string): void {
  getRoomManager().close(peerId);
  useAppStore.getState().removePeer(peerId);
}

export function startClockProbes(peerId: string): void {
  startProbes(peerId);
}

export function stopClockProbes(peerId?: string): void {
  stopProbes(peerId);
}
