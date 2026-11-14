export type DeviceRole = "host" | "receiver";

export type PeerConnectionState = "disconnected" | "connecting" | "connected";

export interface PeerInfo {
  id: string;
  name: string;
  role: DeviceRole;
  isHost: boolean;
  volume: number;
  muted: boolean;
  latencyOffsetMs: number;
  connectionState: PeerConnectionState;
  rttMs?: number;
  jitterMs?: number;
  packetLoss?: number;
  live: boolean;
  sourcePeerId?: string;
  position?: number;
  lastReportedAt?: number;
  lastSeen: number;
}

export interface PlaybackStatus {
  status: "stopped" | "playing" | "paused";
  position: number;
}

export type CommandType =
  | "play"
  | "pause"
  | "stop"
  | "seek"
  | "volume"
  | "mute"
  | "latency"
  | "kick";

export interface CommandMessage {
  type: CommandType;
  position?: number;
  at?: number;
  volume?: number;
  muted?: boolean;
  latencyOffsetMs?: number;
  targetPeerId?: string;
}

export interface SyncPeerState {
  offsetSeconds: number;
  delaySeconds: number;
  jitterSeconds: number;
  packetLoss: number;
  bufferDepthSeconds: number;
  driftPerSecond: number;
  quality: SyncQuality;
  updatedAt: number;
}

export type SyncQuality = "unknown" | "good" | "poor";
