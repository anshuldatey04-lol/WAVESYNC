import type { SpotifyAuthSession, SpotifyTrack } from "../../types/spotify";

const CLIENT_ID = (import.meta.env.VITE_SPOTIFY_CLIENT_ID as string | undefined) ?? "";
const SCOPES = [
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
];
const TOKEN_KEY = "syncwave.spotify.session";
const VERIFIER_KEY = "syncwave.spotify.verifier";
const AUTH_URL = "https://accounts.spotify.com/authorize";
const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";

export function spotifyConfigured(): boolean {
  return CLIENT_ID.length > 0;
}

function redirectUri(): string {
  return `${window.location.origin}${window.location.pathname}`;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function createChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}

function randomString(length: number): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => possible[value % possible.length]).join("");
}

export async function startSpotifyAuth(): Promise<void> {
  if (!spotifyConfigured()) {
    throw new Error("Spotify client ID is not configured (VITE_SPOTIFY_CLIENT_ID).");
  }
  const verifier = randomString(64);
  const challenge = await createChallenge(verifier);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri(),
    scope: SCOPES.join(" "),
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  window.location.assign(`${AUTH_URL}?${params.toString()}`);
}

export function spotifyCallbackCode(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("code");
}

function storeSession(session: SpotifyAuthSession): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function loadSession(): SpotifyAuthSession | null {
  const raw = localStorage.getItem(TOKEN_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SpotifyAuthSession;
    if (!parsed.accessToken || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function requestToken(body: URLSearchParams): Promise<SpotifyAuthSession> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) {
    throw new Error(`Spotify token exchange failed (${response.status})`);
  }
  const payload = (await response.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const existing = loadSession();
  const session: SpotifyAuthSession = {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? existing?.refreshToken ?? "",
    expiresAt: Date.now() + payload.expires_in * 1000,
  };
  storeSession(session);
  return session;
}

export async function completeSpotifyAuth(): Promise<SpotifyAuthSession | null> {
  const code = spotifyCallbackCode();
  if (!code) return null;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) return null;
  const url = new URL(window.location.href);
  url.searchParams.delete("code");
  url.searchParams.delete("state");
  window.history.replaceState({}, "", url.toString());
  sessionStorage.removeItem(VERIFIER_KEY);
  return requestToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    })
  );
}

async function refreshSession(session: SpotifyAuthSession): Promise<SpotifyAuthSession> {
  if (!session.refreshToken) throw new Error("Spotify session expired. Reconnect Spotify.");
  return requestToken(
    new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: session.refreshToken,
    })
  );
}

async function authToken(): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session.accessToken;
  try {
    const refreshed = await refreshSession(session);
    return refreshed.accessToken;
  } catch {
    clearSession();
    return null;
  }
}

interface SpotifyApiTrack {
  id?: string;
  name?: string;
  artists?: Array<{ name: string }>;
  album?: { name: string; images?: Array<{ url: string }> };
  duration_ms?: number;
  uri?: string;
}

interface CurrentlyPlayingPayload {
  is_playing?: boolean;
  currently_playing_type?: string;
  device?: { id?: string };
  item?: SpotifyApiTrack;
}

export interface SpotifyNowPlaying {
  playing: boolean;
  track: SpotifyTrack | null;
  deviceId: string | null;
}

export async function fetchCurrentlyPlaying(): Promise<SpotifyNowPlaying | null> {
  const token = await authToken();
  if (!token) return null;
  const response = await fetch(`${API_URL}/me/player/currently-playing`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 204) return { playing: false, track: null, deviceId: null };
  if (!response.ok) {
    throw new Error(`Spotify playback request failed (${response.status})`);
  }
  const payload = (await response.json()) as CurrentlyPlayingPayload;
  const item = payload.item;
  if (!item) return { playing: Boolean(payload.is_playing), track: null, deviceId: payload.device?.id ?? null };
  return {
    playing: Boolean(payload.is_playing),
    deviceId: payload.device?.id ?? null,
    track: {
      id: item.id ?? "",
      name: item.name ?? "Unknown track",
      artists: (item.artists ?? []).map((artist) => artist.name),
      album: item.album?.name ?? "",
      artworkUrl: item.album?.images?.[0]?.url ?? "",
      durationMs: item.duration_ms ?? 0,
      uri: item.uri ?? "",
    },
  };
}

async function control(action: "play" | "pause" | "next" | "previous"): Promise<void> {
  const token = await authToken();
  if (!token) throw new Error("Spotify is not connected.");
  const method = action === "next" || action === "previous" ? "POST" : "PUT";
  const endpoint =
    action === "play" || action === "pause"
      ? `${API_URL}/me/player/${action}`
      : `${API_URL}/me/player/${action}`;
  const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Spotify ${action} failed (${response.status}). Ensure Premium and an active device.`);
  }
}

export const spotifyControls = {
  play: () => control("play"),
  pause: () => control("pause"),
  next: () => control("next"),
  previous: () => control("previous"),
  openApp: () => {
    window.open("https://open.spotify.com", "_blank", "noopener,noreferrer");
  },
};
