export interface SignalEnvelope {
  kind: "offer" | "answer" | "ice" | "prepare";
  peerId: string;
  from: string;
  to: string;
  data: unknown;
}

export interface RelayEnvelope {
  kind: "playback" | "position" | "sync_probe" | "sync_probe_reply" | "heartbeat" | "state";
  roomId: string;
  from: string;
  to: string;
  payload: unknown;
}

export interface HostAudioMeta {
  kind: "audio_meta";
  roomId: string;
  from: string;
  name: string;
  duration: number;
  size: number;
}

export interface HostPlaybackMeta {
  kind: "playback_meta";
  roomId: string;
  from: string;
  status: "playing" | "paused" | "stopped";
  position: number;
}
