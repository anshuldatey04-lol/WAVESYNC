import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useRoomConnection, useRoomEvents, type RoomEvents } from "../hooks/useRoomConnection";
import { useAudioEngine } from "../hooks/useAudioEngine";
import { useNetworkMonitor } from "../hooks/useNetworkMonitor";
import { ctxSecondsToEpoch, epochSecondsToAudioSeconds } from "../lib/audio/engine";
import { getAudioContext, nowEpochSeconds } from "../lib/audio/context";
import { getHostToken } from "../lib/room/connection";
import { SYNCWAVE_SERVER_URL, SYNC_LOOKAHEAD_SECONDS } from "../lib/config";
import { evaluateSyncQuality } from "../lib/sync/metrics";
import type { CommandMessage } from "../types/room";
import NowPlaying from "./NowPlaying";
import PlayerControls from "./PlayerControls";
import SpeakerGrid from "./SpeakerGrid";
import SyncMonitor from "./SyncMonitor";
import NetworkPanel from "./NetworkPanel";
import SpotifyPanel from "./SpotifyPanel";
import QrCodeCard from "./QrCodeCard";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read audio file"));
    reader.readAsDataURL(file);
  });
}

export default function RoomScreen() {
  const mode = useAppStore((state) => state.mode);
  const roomId = useAppStore((state) => state.roomId);
  const roomName = useAppStore((state) => state.roomName);
  const peers = useAppStore((state) => state.peers);
  const playback = useAppStore((state) => state.playback);
  const audio = useAppStore((state) => state.audio);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const error = useAppStore((state) => state.error);
  const selfPeerId = useAppStore((state) => state.selfPeerId);

  const {
    sendControl,
    broadcastToReceivers,
    sendAudioMeta,
    disconnectSpeaker,
    leaveRoom,
  } = useRoomConnection();
  const { getEngine, loadFile } = useAudioEngine();
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [joinOrigin, setJoinOrigin] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingPlayRef = useRef<CommandMessage | null>(null);

  const isHost = mode === "host";

  useEffect(() => {
    if (!isHost) return;
    let cancelled = false;
    fetch(`${SYNCWAVE_SERVER_URL}/api/network`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { port?: number; addresses?: string[] } | null) => {
        if (cancelled || !payload?.addresses?.length) return;
        const port = payload.port ?? (window.location.port || "8787");
        setJoinOrigin(`http://${payload.addresses[0]}:${port}`);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [isHost]);
  const peerList = useMemo(
    () => Object.values(peers).sort((a, b) => Number(b.isHost) - Number(a.isHost)),
    [peers]
  );
  const hostPeer = useMemo(() => peerList.find((peer) => peer.isHost) ?? null, [peerList]);
  const hostPeerId = hostPeer?.id ?? null;
  const firstReceiverId = peerList.find((peer) => !peer.isHost)?.id ?? null;
  const measuredPeerId = isHost ? firstReceiverId : hostPeerId;
  useNetworkMonitor(measuredPeerId);

  const handlePlaybackCommand = useCallback(
    (peerId: string, command: CommandMessage) => {
      void peerId;
      const state = useAppStore.getState();
      if (state.mode === "host") return;
      if (command.targetPeerId && command.targetPeerId !== state.selfPeerId) return;
      const self = state.selfPeerId ? state.peers[state.selfPeerId] : null;
      const engine = getEngine();
      const latencySeconds = state.sync.offsetSeconds + (self?.latencyOffsetMs ?? 0) / 1000;
      const gain = self ? (self.muted ? 0 : self.volume) : 1;

      if (command.type === "kick") {
        leaveRoom();
        return;
      }
      if (command.type === "volume") {
        if (self && typeof command.volume === "number") {
          state.upsertPeer({ ...self, volume: command.volume, muted: false });
          engine.setGain(command.volume);
        }
        return;
      }
      if (command.type === "mute") {
        if (self && typeof command.muted === "boolean") {
          state.upsertPeer({ ...self, muted: command.muted });
          engine.setGain(command.muted ? 0 : self.volume);
        }
        return;
      }
      if (command.type === "latency") {
        if (self && typeof command.latencyOffsetMs === "number") {
          state.upsertPeer({ ...self, latencyOffsetMs: command.latencyOffsetMs });
        }
        return;
      }

      if ((command.type === "play" || command.type === "seek") && !engine.getCurrentBuffer()) {
        pendingPlayRef.current = command;
        return;
      }

      const atEpoch = command.at ?? nowEpochSeconds();
      const ctxTime = epochSecondsToAudioSeconds(atEpoch) - latencySeconds;
      if (command.type === "play" || command.type === "seek") {
        engine.play(ctxTime, command.position ?? 0, gain);
        state.setPlayback({ status: "playing", position: command.position ?? 0 });
        state.setAudioStatus("playing");
      } else if (command.type === "pause") {
        engine.pause(ctxTime);
        state.setPlayback({ status: "paused", position: engine.getPosition() });
        state.setAudioStatus("paused");
      } else if (command.type === "stop") {
        engine.stopAt(ctxTime);
        state.setPlayback({ status: "stopped", position: 0 });
        state.setAudioStatus("stopped");
      }
    },
    [getEngine, leaveRoom]
  );

  const handlePeerPosition = useCallback(
    (peerId: string, position: number, status: "playing" | "paused" | "stopped") => {
      const state = useAppStore.getState();
      if (state.mode !== "host") return;
      const engine = getEngine();
      const expected = engine.isPlaying ? engine.getPosition() : state.playback.position;
      const drift = status === "playing" ? position - expected : 0;
      const quality = evaluateSyncQuality({
        offsetSeconds: state.sync.offsetSeconds,
        delaySeconds: state.sync.delaySeconds,
        jitterSeconds: state.sync.jitterSeconds,
        packetLoss: state.sync.packetLoss,
      });
      state.setSync({
        ...state.sync,
        driftPerSecond: drift,
        bufferDepthSeconds:
          status === "playing" ? Math.max(0, engine.getDuration() - position) : state.sync.bufferDepthSeconds,
        quality,
        updatedAt: Date.now(),
      });
      const peer = state.peers[peerId];
      if (peer) {
        state.upsertPeer({ ...peer, position, lastReportedAt: Date.now() });
      }
    },
    [getEngine]
  );

  const handleAudioMeta = useCallback(
    (meta: { name: string; duration: number; size: number }) => {
      const state = useAppStore.getState();
      state.setAudio(meta);
      if (state.mode === "host" || !state.roomId) return;
      void (async () => {
        try {
          const response = await fetch(`${SYNCWAVE_SERVER_URL}/api/rooms/${state.roomId}/audio`);
          if (!response.ok) throw new Error("Audio is not available on the signaling server yet");
          const payload = (await response.json()) as { data?: string };
          if (!payload.data) throw new Error("Audio payload is empty");
          const binary = atob(payload.data);
          const bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index += 1) {
            bytes[index] = binary.charCodeAt(index);
          }
          const ctx = getAudioContext();
          const buffer = await ctx.decodeAudioData(bytes.buffer);
          await getEngine().loadBuffer(buffer);
          state.setError(null);
          const pending = pendingPlayRef.current;
          pendingPlayRef.current = null;
          if (pending) handlePlaybackCommand("host", pending);
        } catch {
          state.setError("Failed to load the synchronized audio file from the host.");
        }
      })();
    },
    [getEngine, handlePlaybackCommand]
  );

  const handlePeerReady = useCallback(
    (peerId: string) => {
      const state = useAppStore.getState();
      if (state.mode !== "host") return;
      if (state.audio) {
        sendControl(peerId, { kind: "audio:meta", payload: state.audio });
      }
      if (state.playback.status === "playing" && state.audio) {
        const engine = getEngine();
        const position = engine.isPlaying ? engine.getPosition() : state.playback.position;
        const ctx = getAudioContext();
        const ctxTime = ctx.currentTime + SYNC_LOOKAHEAD_SECONDS;
        sendControl(peerId, {
          kind: "playback:command",
          payload: {
            type: "play",
            position,
            at: ctxSecondsToEpoch(ctxTime),
          } satisfies CommandMessage,
        });
      }
    },
    [getEngine, sendControl]
  );

  const events = useMemo<RoomEvents>(
    () => ({
      onPlaybackCommand: handlePlaybackCommand,
      onPeerPosition: handlePeerPosition,
      onAudioMeta: handleAudioMeta,
      onPeerReady: handlePeerReady,
      onRoomClosed: () => undefined,
    }),
    [handlePlaybackCommand, handlePeerPosition, handleAudioMeta, handlePeerReady]
  );

  useRoomEvents(events);

  useEffect(() => {
    if (audioStatus !== "playing") return;
    const timer = window.setInterval(() => {
      const state = useAppStore.getState();
      if (state.audioStatus !== "playing") return;
      const engine = getEngine();
      if (!engine.isPlaying) {
        state.setPlayback({ status: "stopped", position: 0 });
        state.setAudioStatus("stopped");
        return;
      }
      state.setPlayback({ status: "playing", position: engine.getPosition() });
    }, 250);
    return () => window.clearInterval(timer);
  }, [audioStatus, getEngine]);

  useEffect(() => {
    if (mode !== "receiver" || audioStatus !== "playing" || !hostPeerId) return;
    const timer = window.setInterval(() => {
      const state = useAppStore.getState();
      if (state.audioStatus !== "playing" || state.mode !== "receiver") return;
      sendControl(hostPeerId, {
        kind: "position",
        position: getEngine().getPosition(),
        status: "playing",
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [mode, audioStatus, hostPeerId, getEngine, sendControl]);

  const handleHostPlay = useCallback(() => {
    const state = useAppStore.getState();
    if (!state.audio) {
      state.setError("Upload an authorized audio file before starting playback.");
      return;
    }
    const engine = getEngine();
    const position =
      state.playback.status === "playing" ? engine.getPosition() : state.playback.position;
    const ctx = getAudioContext();
    const ctxTime = ctx.currentTime + SYNC_LOOKAHEAD_SECONDS;
    engine.play(ctxTime, position, state.selfPeerId ? state.peers[state.selfPeerId]?.volume ?? 1 : 1);
    state.setPlayback({ status: "playing", position });
    state.setAudioStatus("playing");
    state.setError(null);
    broadcastToReceivers({
      kind: "playback:command",
      payload: { type: "play", position, at: ctxSecondsToEpoch(ctxTime) } satisfies CommandMessage,
    });
  }, [broadcastToReceivers, getEngine]);

  const handleHostPause = useCallback(() => {
    const state = useAppStore.getState();
    const engine = getEngine();
    engine.pause();
    const position = engine.getPosition();
    state.setPlayback({ status: "paused", position });
    state.setAudioStatus("paused");
    broadcastToReceivers({
      kind: "playback:command",
      payload: { type: "pause", position, at: nowEpochSeconds() } satisfies CommandMessage,
    });
  }, [broadcastToReceivers, getEngine]);

  const handleHostStop = useCallback(() => {
    const state = useAppStore.getState();
    getEngine().stop();
    state.setPlayback({ status: "stopped", position: 0 });
    state.setAudioStatus("stopped");
    broadcastToReceivers({
      kind: "playback:command",
      payload: { type: "stop", position: 0, at: nowEpochSeconds() } satisfies CommandMessage,
    });
  }, [broadcastToReceivers, getEngine]);

  const handleHostSeek = useCallback(
    (position: number) => {
      const state = useAppStore.getState();
      const engine = getEngine();
      const ctx = getAudioContext();
      const ctxTime = ctx.currentTime + SYNC_LOOKAHEAD_SECONDS;
      engine.play(ctxTime, position, state.selfPeerId ? state.peers[state.selfPeerId]?.volume ?? 1 : 1);
      state.setPlayback({ status: "playing", position });
      state.setAudioStatus("playing");
      broadcastToReceivers({
        kind: "playback:command",
        payload: { type: "seek", position, at: ctxSecondsToEpoch(ctxTime) } satisfies CommandMessage,
      });
    },
    [broadcastToReceivers, getEngine]
  );

  const handleVolumeChange = useCallback(
    (peerId: string, volume: number) => {
      const state = useAppStore.getState();
      const peer = state.peers[peerId];
      if (!peer) return;
      state.upsertPeer({ ...peer, volume, muted: false });
      if (peerId === state.selfPeerId) {
        getEngine().setGain(volume);
        return;
      }
      if (state.mode === "host") {
        sendControl(peerId, {
          kind: "playback:command",
          payload: { type: "volume", volume, targetPeerId: peerId } satisfies CommandMessage,
        });
      }
    },
    [getEngine, sendControl]
  );

  const handleMuteToggle = useCallback(
    (peerId: string) => {
      const state = useAppStore.getState();
      const peer = state.peers[peerId];
      if (!peer) return;
      const muted = !peer.muted;
      state.upsertPeer({ ...peer, muted });
      if (peerId === state.selfPeerId) {
        getEngine().setGain(muted ? 0 : peer.volume);
        return;
      }
      if (state.mode === "host") {
        sendControl(peerId, {
          kind: "playback:command",
          payload: { type: "mute", muted, targetPeerId: peerId } satisfies CommandMessage,
        });
      }
    },
    [getEngine, sendControl]
  );

  const handleLatencyChange = useCallback(
    (peerId: string, latencyOffsetMs: number) => {
      const state = useAppStore.getState();
      const peer = state.peers[peerId];
      if (!peer) return;
      state.upsertPeer({ ...peer, latencyOffsetMs });
      if (peerId !== state.selfPeerId && state.mode === "host") {
        sendControl(peerId, {
          kind: "playback:command",
          payload: { type: "latency", latencyOffsetMs, targetPeerId: peerId } satisfies CommandMessage,
        });
      }
    },
    [sendControl]
  );

  const handleDisconnectSpeaker = useCallback(
    (peerId: string) => {
      if (peerId === selfPeerId) {
        leaveRoom();
        return;
      }
      sendControl(peerId, {
        kind: "playback:command",
        payload: { type: "kick" } satisfies CommandMessage,
      });
      window.setTimeout(() => disconnectSpeaker(peerId), 400);
    },
    [disconnectSpeaker, leaveRoom, selfPeerId, sendControl]
  );

  const handleUpload = useCallback(
    async (file: File) => {
      const state = useAppStore.getState();
      if (!state.roomId) return;
      setUploading(true);
      state.setError(null);
      try {
        const result = await loadFile(file);
        getEngine().stop();
        broadcastToReceivers({
          kind: "playback:command",
          payload: { type: "stop", position: 0, at: nowEpochSeconds() } satisfies CommandMessage,
        });
        const data = await readFileAsBase64(file);
        const token = getHostToken();
        const response = await fetch(`${SYNCWAVE_SERVER_URL}/api/rooms/${state.roomId}/audio`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { "x-syncwave-host-token": token } : {}),
          },
          body: JSON.stringify({ name: file.name, duration: result.duration, size: file.size, data }),
        });
        if (!response.ok) {
          throw new Error("Signaling server rejected the audio payload");
        }
        sendAudioMeta({ name: file.name, duration: result.duration, size: file.size });
        state.setPlayback({ status: "stopped", position: 0 });
        state.setAudioStatus("stopped");
      } catch {
        state.setError("Could not prepare this audio file. Use an authorized MP3, WAV, OGG or M4A file.");
      } finally {
        setUploading(false);
      }
    },
    [broadcastToReceivers, getEngine, loadFile, sendAudioMeta]
  );

  const handleUnlockAudio = useCallback(() => {
    const ctx = getAudioContext();
    void ctx.resume().then(() => setAudioUnlocked(true));
  }, []);

  const joinUrl =
    typeof window !== "undefined" && roomId
      ? `${joinOrigin ?? window.location.origin}/?room=${roomId}`
      : roomId ?? "";

  if (!mode) {
    return (
      <main className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6">
        <p className="text-slate-400">Create or join a room to start synchronized playback.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-8 sm:px-6" data-testid="room-screen">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-sky-400">{isHost ? "Hosting" : "Connected"}</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-white" data-testid="room-id">
            {roomId ?? "SYNC-"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">{roomName}</p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              connectionStatus === "connected"
                ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                : "border-amber-400/30 bg-amber-400/10 text-amber-300"
            }`}
          >
            {connectionStatus}
          </span>
          <button
            onClick={leaveRoom}
            className="rounded-full border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-semibold text-rose-300 transition hover:bg-rose-400/20"
            data-testid="leave-room-button"
          >
            Leave room
          </button>
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-300" data-testid="room-error">
          {error}
        </p>
      ) : null}

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <NowPlaying />
          <PlayerControls
            disabled={!isHost}
            onPlay={handleHostPlay}
            onPause={handleHostPause}
            onStop={handleHostStop}
            onSeek={handleHostSeek}
          />
          <SyncMonitor />
          <NetworkPanel />
          <SpotifyPanel />
        </div>

        <div className="space-y-6">
          {!isHost ? (
            <section className="rounded-3xl border border-sky-400/20 bg-sky-400/[0.06] p-5 backdrop-blur-xl">
              <h3 className="text-sm font-semibold text-sky-200">Receiver audio</h3>
              <p className="mt-2 text-xs text-slate-400">
                Browsers require a tap before this device may play synchronized audio.
              </p>
              <button
                onClick={handleUnlockAudio}
                disabled={audioUnlocked}
                className="mt-3 w-full rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-2.5 text-sm font-semibold text-sky-200 transition hover:bg-sky-400/20 disabled:opacity-50"
                data-testid="unlock-audio-button"
              >
                {audioUnlocked ? "Audio enabled" : "Enable receiver audio"}
              </button>
            </section>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="speakers-section">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Connected speakers</h3>
              <span className="font-mono text-xs text-slate-500">{peerList.length}</span>
            </div>
            <div className="mt-4">
              <SpeakerGrid
                peers={peerList}
                selfPeerId={selfPeerId}
                isHostView={isHost}
                onVolumeChange={handleVolumeChange}
                onMuteToggle={handleMuteToggle}
                onLatencyChange={handleLatencyChange}
                onDisconnect={handleDisconnectSpeaker}
              />
            </div>
          </section>

          {isHost && roomId ? (
            <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Host controls</h3>
              <div className="mt-4 space-y-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 text-sm font-semibold text-sky-300 transition hover:bg-sky-400/20 disabled:opacity-50"
                  data-testid="upload-audio-button"
                >
                  {uploading ? "Preparing audioâ€¦" : audio ? "Replace synchronized audio" : "Upload synchronized audio"}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleUpload(file);
                    event.target.value = "";
                  }}
                />
                {audio ? (
                  <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                    <p className="truncate text-sm font-medium text-white" data-testid="hot-audio-name">
                      {audio.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {audio.duration.toFixed(1)}s Â· {(audio.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                ) : null}
                <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                  <QrCodeCard value={joinUrl} size={150} />
                  <button
                    onClick={() => {
                      void navigator.clipboard?.writeText(joinUrl);
                    }}
                    className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
                  >
                    Copy join link
                  </button>
                </div>
              </div>
            </section>
          ) : null}

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl">
            <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Session</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Role</dt>
                <dd className="font-medium text-slate-200">{isHost ? "Host" : "Receiver"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Speakers</dt>
                <dd className="font-medium text-slate-200">{peerList.filter((peer) => !peer.isHost).length}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Self peer</dt>
                <dd className="max-w-[10rem] truncate font-mono text-xs text-slate-400">{selfPeerId ?? "â€”"}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Playback</dt>
                <dd className="font-medium capitalize text-slate-200">{audioStatus}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Queue position</dt>
                <dd className="font-mono text-xs text-slate-400">{playback.position.toFixed(2)}s</dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </main>
  );
}
