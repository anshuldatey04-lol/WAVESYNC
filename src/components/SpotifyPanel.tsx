import { useCallback, useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import {
  clearSession,
  completeSpotifyAuth,
  fetchCurrentlyPlaying,
  spotifyConfigured,
  spotifyControls,
  startSpotifyAuth,
} from "../lib/spotify/client";

export default function SpotifyPanel() {
  const spotify = useAppStore((state) => state.spotify);
  const setSpotify = useAppStore((state) => state.setSpotify);
  const configured = spotifyConfigured();

  const refresh = useCallback(async () => {
    const nowPlaying = await fetchCurrentlyPlaying().catch(() => null);
    if (!nowPlaying) {
      setSpotify({ authenticated: false, connectionStatus: "disconnected", track: null });
      return;
    }
    setSpotify({
      enabled: true,
      authenticated: true,
      connectionStatus: "connected",
      playbackStatus: nowPlaying.playing ? "playing" : "paused",
      track: nowPlaying.track,
      deviceId: nowPlaying.deviceId,
      lastError: null,
    });
  }, [setSpotify]);

  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      try {
        await completeSpotifyAuth();
        if (cancelled) return;
        setSpotify({ enabled: true, connectionStatus: "connecting" });
        await refresh();
      } catch (error) {
        if (!cancelled) {
          setSpotify({
            enabled: true,
            connectionStatus: "error",
            lastError: error instanceof Error ? error.message : "Spotify authentication failed.",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, refresh, setSpotify]);

  useEffect(() => {
    if (!spotify.authenticated) return;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [spotify.authenticated, refresh]);

  const handleEnable = async () => {
    try {
      await startSpotifyAuth();
    } catch (error) {
      setSpotify({
        connectionStatus: "error",
        lastError: error instanceof Error ? error.message : "Spotify is unavailable.",
      });
    }
  };

  const handleControl = async (action: keyof typeof spotifyControls) => {
    try {
      await spotifyControls[action]();
      setSpotify({ lastError: null });
      window.setTimeout(() => void refresh(), 600);
    } catch (error) {
      setSpotify({ lastError: error instanceof Error ? error.message : "Spotify command failed." });
    }
  };

  const statusStyles: Record<string, string> = {
    disconnected: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    connecting: "bg-amber-400/15 text-amber-300 border-amber-400/30",
    connected: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
    error: "bg-rose-400/15 text-rose-300 border-rose-400/30",
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="spotify-panel">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Spotify (separate)</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyles[spotify.connectionStatus]}`}>
          {configured ? spotify.connectionStatus : "not configured"}
        </span>
      </div>

      {!configured ? (
        <p className="mt-4 text-sm text-slate-400">
          Spotify integration is disabled because <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">VITE_SPOTIFY_CLIENT_ID</code>{" "}
          is not set. Add it to <code className="rounded bg-black/40 px-1.5 py-0.5 text-xs">.env</code> and restart the dev server.
        </p>
      ) : !spotify.authenticated ? (
        <div className="mt-4">
          <p className="text-sm text-slate-400">Connect Spotify to view metadata and control playback on your account separately from SYNCWAVE rooms.</p>
          <button
            onClick={() => void handleEnable()}
            className="mt-3 rounded-full border border-sky-400/30 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-300 transition hover:bg-sky-400/20"
            data-testid="spotify-connect-button"
          >
            Connect Spotify (PKCE)
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <div className="flex items-center gap-4">
            {spotify.track?.artworkUrl ? (
              <img src={spotify.track.artworkUrl} alt="" className="h-16 w-16 rounded-xl object-cover" />
            ) : (
              <div className="h-16 w-16 rounded-xl bg-gradient-to-br from-emerald-500/30 to-black" />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white" data-testid="spotify-track">
                {spotify.track?.name ?? "No active Spotify playback"}
              </p>
              <p className="truncate text-xs text-slate-400">{spotify.track?.artists.join(", ") ?? "Open Spotify on any device"}</p>
              <p className="mt-1 text-[11px] capitalize text-slate-500">{spotify.playbackStatus}</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleControl("previous")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Previous
            </button>
            <button
              onClick={() => void handleControl(spotify.playbackStatus === "playing" ? "pause" : "play")}
              className="rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-400/20"
            >
              {spotify.playbackStatus === "playing" ? "Pause" : "Play"}
            </button>
            <button
              onClick={() => void handleControl("next")}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Next
            </button>
            <button
              onClick={spotifyControls.openApp}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
            >
              Open Spotify
            </button>
            <button
              onClick={() => {
                clearSession();
                setSpotify({ authenticated: false, connectionStatus: "disconnected", track: null });
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-400 hover:text-white"
            >
              Disconnect
            </button>
          </div>

          {spotify.lastError ? <p className="mt-3 text-xs text-rose-300">{spotify.lastError}</p> : null}
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Spotify runs as an independent integration: SYNCWAVE never captures, records, alters, redistributes or retransmits
        Spotify audio, and Spotify playback is never mixed into the synchronized audio engine.
      </p>
    </section>
  );
}
