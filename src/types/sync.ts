import type { SyncPeerState } from "./room";

export interface ClockProbe {
  kind: "sync_probe" | "sync_probe_reply";
  fromId: string;
  toId: string;
  t1?: number;
  t3?: number;
  echoT1?: number;
}

export interface SyncMetrics extends SyncPeerState {
  offsetSamples: number;
  delaySamples: number;
  rttSamples: number;
}

export interface NetworkMetrics {
  connectionType: "unknown" | "lan" | "webrc" | "turn" | "internet" | "offline";
  rttMs: number | null;
  jitterMs: number | null;
  packetLoss: number | null;
  candidateType: string | null;
  iceState: string | null;
  uplink: number | null;
  downlink: number | null;
  updatedAt: number;
}

export interface SyncState {
  metrics: SyncMetrics;
  lastCorrectionSeconds: number;
}

export interface AudioBufferInfo {
  name: string;
  duration: number;
  size: number;
}

export interface TrackInfo {
  title: string;
  artist: string;
  album?: string;
  artworkUrl?: string;
}
