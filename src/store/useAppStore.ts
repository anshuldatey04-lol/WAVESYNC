import { create } from "zustand";
import type { PeerInfo, PlaybackStatus } from "../types/room";
import type { NetworkMetrics, SyncMetrics } from "../types/sync";
import type { SpotifyPlaybackState } from "../types/spotify";

export type Screen = "home" | "room";
export type Mode = "host" | "receiver" | null;
export type ConnectionStatus = "disconnected" | "connecting" | "connected";
export type AudioStatus = "idle" | "stopped" | "playing" | "paused";

export interface AudioMeta {
  name: string;
  duration: number;
  size: number;
}

export interface AppState {
  screen: Screen;
  mode: Mode;
  connectionStatus: ConnectionStatus;
  roomId: string | null;
  roomName: string;
  selfPeerId: string | null;
  peers: Record<string, PeerInfo>;
  playback: PlaybackStatus;
  audioStatus: AudioStatus;
  audio: AudioMeta | null;
  sync: SyncMetrics;
  network: NetworkMetrics;
  live: boolean;
  liveStream: MediaStream | null;
  spotify: SpotifyPlaybackState;
  error: string | null;
}

export interface AppStore extends AppState {
  setScreen: (screen: Screen) => void;
  setMode: (mode: Mode) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setRoom: (roomId: string | null, roomName: string) => void;
  setSelfPeerId: (id: string | null) => void;
  upsertPeer: (peer: PeerInfo) => void;
  removePeer: (peerId: string) => void;
  setPlayback: (playback: PlaybackStatus) => void;
  setAudioStatus: (status: AudioStatus) => void;
  setAudio: (audio: AudioMeta | null) => void;
  setSync: (sync: SyncMetrics) => void;
  setNetwork: (network: NetworkMetrics) => void;
  setLiveStream: (stream: MediaStream | null) => void;
  setSpotify: (spotify: Partial<SpotifyPlaybackState>) => void;
  setError: (error: string | null) => void;
}

const initialNetwork: NetworkMetrics = {
  connectionType: "unknown",
  rttMs: null,
  jitterMs: null,
  packetLoss: null,
  candidateType: null,
  iceState: null,
  uplink: null,
  downlink: null,
  updatedAt: 0,
};

const initialSync: SyncMetrics = {
  offsetSeconds: 0,
  delaySeconds: 0,
  jitterSeconds: 0,
  packetLoss: 0,
  bufferDepthSeconds: 0,
  driftPerSecond: 0,
  quality: "unknown",
  updatedAt: 0,
  offsetSamples: 0,
  delaySamples: 0,
  rttSamples: 0,
};

export const useAppStore = create<AppStore>((set) => ({
  screen: "home",
  mode: null,
  connectionStatus: "disconnected",
  roomId: null,
  roomName: "",
  selfPeerId: null,
  peers: {},
  playback: { status: "stopped", position: 0 },
  audioStatus: "idle",
  audio: null,
  sync: initialSync,
  network: initialNetwork,
  live: false,
  liveStream: null,
  spotify: {
    enabled: false,
    authenticated: false,
    connectionStatus: "disconnected",
    playbackStatus: "stopped",
    track: null,
    deviceId: null,
    lastError: null,
  },
  error: null,

  setScreen: (screen) => set({ screen }),
  setMode: (mode) => set({ mode }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setRoom: (roomId, roomName) => set({ roomId, roomName }),
  setSelfPeerId: (id) => set({ selfPeerId: id }),
  upsertPeer: (peer) =>
    set((state) => ({
      peers: { ...state.peers, [peer.id]: { ...peer, lastSeen: Date.now() } },
    })),
  removePeer: (peerId) =>
    set((state) => {
      const peers = { ...state.peers };
      delete peers[peerId];
      return { peers };
    }),
  setPlayback: (playback) => set({ playback }),
  setAudioStatus: (status) => set({ audioStatus: status }),
  setAudio: (audio) => set({ audio }),
  setSync: (sync) => set({ sync }),
  setNetwork: (network) => set({ network }),
  setLiveStream: (stream) => set({ liveStream: stream, live: stream !== null }),
  setSpotify: (spotify) =>
    set((state) => ({ spotify: { ...state.spotify, ...spotify } })),
  setError: (error) => set({ error }),
}));

export function selectPeers(state: AppState): PeerInfo[] {
  return Object.values(state.peers).sort((a, b) => Number(b.isHost) - Number(a.isHost));
}

export function selectHostPeer(state: AppState): PeerInfo | null {
  const peers = Object.values(state.peers);
  return peers.find((p) => p.isHost) ?? null;
}

export function selectSelfPeer(state: AppState): PeerInfo | null {
  if (!state.selfPeerId) return null;
  return state.peers[state.selfPeerId] ?? null;
}
