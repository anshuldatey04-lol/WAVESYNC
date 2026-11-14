function resolveDefaultServerUrl(): string {
  if (typeof window === "undefined") return "http://localhost:8787";
  if (import.meta.env.PROD) return window.location.origin;
  const host = window.location.hostname;
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return `http://${host}:8787`;
  }
  return "http://localhost:8787";
}

export const SYNCWAVE_SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? resolveDefaultServerUrl();

export const SYNCWAVE_ROOM_TTL_MS = 10 * 60 * 1000;

export const SYNC_OFFSET_THRESHOLD_SECONDS = 0.05;
export const SYNC_DRIFT_THRESHOLD_SECONDS_PER_SEC = 0.02;
export const SYNC_PROBE_INTERVAL_MS = 2000;
export const SYNC_LOOKAHEAD_SECONDS = 2.0;
export const SYNC_BUFFER_TARGET_SECONDS = 3.0;

export const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    ...(import.meta.env.VITE_TURN_URL
      ? [
          {
            urls: [import.meta.env.VITE_TURN_URL],
            username: import.meta.env.VITE_TURN_USERNAME ?? "",
            credential: import.meta.env.VITE_TURN_CREDENTIAL ?? "",
          },
        ]
      : []),
  ],
};
