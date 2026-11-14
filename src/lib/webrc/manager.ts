import { RTC_CONFIG } from "../config";

export type PeerConnectionStateKind =
  | "new"
  | "connecting"
  | "connected"
  | "failed"
  | "disconnected"
  | "closed";

export interface PeerConnectionEntry {
  peerId: string;
  pc: RTCPeerConnection | null;
  dataChannel: RTCDataChannel | null;
  state: PeerConnectionStateKind;
  pendingIce: RTCIceCandidateInit[];
}

export interface TransportStats {
  state: PeerConnectionStateKind;
  roundTripTimeSeconds: number | null;
  jitterSeconds: number | null;
  packetLoss: number | null;
  bytesSent: number;
  bytesReceived: number;
  candidateType: string | null;
  localCandidateType: string | null;
  remoteCandidateType: string | null;
}

type TransportEvents = {
  onTrack: (peerId: string, stream: MediaStream) => void;
  onDataChannel: (peerId: string, channel: RTCDataChannel) => void;
  onConnectionStateChange: (peerId: string, state: PeerConnectionStateKind) => void;
  onIceCandidate: (peerId: string, candidate: RTCIceCandidateInit) => void;
  onDataMessage: (peerId: string, data: unknown) => void;
};

export class WebRTCPeerManager {
  private entries = new Map<string, PeerConnectionEntry>();
  private events: TransportEvents;
  private dataChannelOpenHandlers = new Map<string, (channel: RTCDataChannel) => void>();

  constructor(events: TransportEvents) {
    this.events = events;
  }

  private bindDataChannel(entry: PeerConnectionEntry, channel: RTCDataChannel): void {
    entry.dataChannel = channel;
    channel.onmessage = (messageEvent) => {
      let data: unknown = null;
      try {
        data = JSON.parse(messageEvent.data.toString());
      } catch {
        data = { kind: "error", message: messageEvent.data.toString() };
      }
      this.events.onDataMessage(entry.peerId, data);
    };
    const notifyOpen = () => {
      const handler = this.dataChannelOpenHandlers.get(entry.peerId);
      if (handler) handler(channel);
    };
    channel.onopen = notifyOpen;
    if (channel.readyState === "open") notifyOpen();
    this.events.onDataChannel(entry.peerId, channel);
  }

  onDataChannelOpen(peerId: string, handler: (channel: RTCDataChannel) => void): void {
    this.dataChannelOpenHandlers.set(peerId, handler);
  }

  private entry(peerId: string): PeerConnectionEntry {
    let entry = this.entries.get(peerId);
    if (!entry) {
      const pc = new RTCPeerConnection({ ...RTC_CONFIG });
      entry = {
        peerId,
        pc,
        dataChannel: null,
        state: "new",
        pendingIce: [],
      };
      this.entries.set(peerId, entry);
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          this.events.onIceCandidate(peerId, event.candidate.toJSON());
        }
      };
      pc.onconnectionstatechange = () => {
        const nextState = pc.connectionState as PeerConnectionStateKind;
        entry!.state = nextState;
        this.events.onConnectionStateChange(peerId, nextState);
      };
      pc.ondatachannel = (event) => {
        this.bindDataChannel(entry!, event.channel);
      };
      pc.ontrack = (event) => {
        const stream = event.streams[0] ?? new MediaStream();
        this.events.onTrack(peerId, stream);
      };
    }
    return entry;
  }

  getState(peerId: string): PeerConnectionStateKind {
    const entry = this.entries.get(peerId);
    return entry?.state ?? "new";
  }

  getPeerConnection(peerId: string): RTCPeerConnection | null {
    return this.entries.get(peerId)?.pc ?? null;
  }

  getLocalDescription(peerId: string): RTCSessionDescriptionInit | null {
    const entry = this.entries.get(peerId);
    const desc = entry?.pc?.localDescription;
    if (!desc) return null;
    return { type: desc.type, sdp: desc.sdp ?? "" };
  }

  async createOffer(peerId: string, stream?: MediaStream): Promise<RTCSessionDescriptionInit> {
    const entry = this.entry(peerId);
    const pc = entry.pc;
    if (!pc) throw new Error("Peer connection unavailable");
    if (stream) {
      for (const track of stream.getAudioTracks()) {
        pc.addTrack(track, stream);
      }
    }
    if (!entry.dataChannel) {
      const channel = pc.createDataChannel("syncwave", { ordered: true });
      this.bindDataChannel(entry, channel);
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }

  async acceptOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.entry(peerId);
    const pc = entry.pc;
    if (!pc) throw new Error("Peer connection unavailable");
    await pc.setRemoteDescription(offer);
    for (const candidate of entry.pendingIce.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
  }

  async acceptAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const entry = this.entry(peerId);
    const pc = entry.pc;
    if (!pc) throw new Error("Peer connection unavailable");
    if (pc.signalingState !== "have-local-offer") return;
    await pc.setRemoteDescription(answer);
    for (const candidate of entry.pendingIce.splice(0)) {
      await pc.addIceCandidate(candidate).catch(() => undefined);
    }
  }

  addIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const entry = this.entries.get(peerId);
    const pc = entry?.pc;
    if (!entry || !pc) return;
    if (!pc.remoteDescription) {
      entry.pendingIce.push(candidate);
      return;
    }
    void pc.addIceCandidate(candidate).catch(() => undefined);
  }

  sendData(peerId: string, data: unknown): void {
    const entry = this.entries.get(peerId);
    const channel = entry?.dataChannel;
    if (!channel || channel.readyState !== "open") return;
    try {
      channel.send(JSON.stringify(data));
    } catch {
      // channel closed mid-send — ignore
    }
  }

  async getStats(peerId: string): Promise<TransportStats | null> {
    const entry = this.entries.get(peerId);
    const pc = entry?.pc;
    if (!entry || !pc) return null;
    const report = await pc.getStats();
    let roundTripTimeSeconds: number | null = null;
    let jitterSeconds: number | null = null;
    let packetLoss: number | null = null;
    let bytesSent = 0;
    let bytesReceived = 0;
    let localCandidateType: string | null = null;
    let remoteCandidateType: string | null = null;
    const candidateTypes = new Map<string, string>();

    report.forEach((stat) => {
      if (stat.type === "candidate-pair" && (stat as RTCIceCandidatePairStats).nominated) {
        const pair = stat as RTCIceCandidatePairStats;
        if (typeof pair.currentRoundTripTime === "number") roundTripTimeSeconds = pair.currentRoundTripTime;
        if (typeof pair.bytesSent === "number") bytesSent = pair.bytesSent;
        if (typeof pair.bytesReceived === "number") bytesReceived = pair.bytesReceived;
      }
      if (stat.type === "candidate") {
        const candidate = stat as unknown as { id?: string; candidateType?: string };
        candidateTypes.set(candidate.id ?? "", candidate.candidateType ?? "unknown");
      }
      if (stat.type === "local-candidate") {
        localCandidateType =
          (stat as unknown as { candidateType?: string }).candidateType ?? localCandidateType;
      }
      if (stat.type === "remote-candidate") {
        remoteCandidateType =
          (stat as unknown as { candidateType?: string }).candidateType ?? remoteCandidateType;
      }
      if (stat.type === "inbound-rtp") {
        const inbound = stat as RTCInboundRtpStreamStats;
        if (typeof inbound.jitter === "number") jitterSeconds = inbound.jitter;
        const lost = inbound.packetsLost ?? 0;
        const received = inbound.packetsReceived ?? 0;
        if (received + lost > 0) packetLoss = lost / (received + lost);
      }
      if (stat.type === "remote-inbound-rtp") {
        const remoteInbound = stat as unknown as {
          roundTripTime?: number;
          fractionLost?: number;
          jitter?: number;
        };
        if (typeof remoteInbound.roundTripTime === "number") roundTripTimeSeconds = remoteInbound.roundTripTime;
        if (typeof remoteInbound.fractionLost === "number") packetLoss = remoteInbound.fractionLost;
        if (typeof remoteInbound.jitter === "number" && jitterSeconds === null) jitterSeconds = remoteInbound.jitter;
      }
    });

    const candidateType = localCandidateType ?? remoteCandidateType ?? (candidateTypes.size > 0 ? Array.from(candidateTypes.values())[0] : null);
    return {
      state: entry.state,
      roundTripTimeSeconds,
      jitterSeconds,
      packetLoss,
      bytesSent,
      bytesReceived,
      candidateType,
      localCandidateType,
      remoteCandidateType,
    };
  }

  close(peerId: string): void {
    const entry = this.entries.get(peerId);
    entry?.pc?.close();
    this.dataChannelOpenHandlers.delete(peerId);
    this.entries.delete(peerId);
  }

  closeAll(): void {
    for (const entry of this.entries.values()) {
      entry.pc?.close();
    }
    this.dataChannelOpenHandlers.clear();
    this.entries.clear();
  }

  getPeerIds(): string[] {
    return Array.from(this.entries.keys());
  }
}
