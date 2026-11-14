export interface SpotifyTrack {
  id: string;
  name: string;
  artists: string[];
  album: string;
  artworkUrl: string;
  durationMs: number;
  uri: string;
}

export interface SpotifyPlaybackState {
  enabled: boolean;
  authenticated: boolean;
  connectionStatus: "disconnected" | "connecting" | "connected" | "error";
  playbackStatus: "stopped" | "playing" | "paused";
  track: SpotifyTrack | null;
  deviceId: string | null;
  lastError: string | null;
}

export interface SpotifyAuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}
