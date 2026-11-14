import type { PeerInfo } from "../types/room";
import { formatMs } from "../lib/utils";

interface SpeakerCardProps {
  peer: PeerInfo;
  isSelf: boolean;
  isHostView: boolean;
  onVolumeChange: (peerId: string, volume: number) => void;
  onMuteToggle: (peerId: string) => void;
  onLatencyChange: (peerId: string, latencyOffsetMs: number) => void;
  onDisconnect: (peerId: string) => void;
}

export default function SpeakerCard({
  peer,
  isSelf,
  isHostView,
  onVolumeChange,
  onMuteToggle,
  onLatencyChange,
  onDisconnect,
}: SpeakerCardProps) {
  const connected = peer.connectionState === "connected";
  const statusColor = connected
    ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
    : peer.connectionState === "connecting"
      ? "border-amber-400/30 bg-amber-400/10 text-amber-300"
      : "border-slate-500/30 bg-slate-500/10 text-slate-300";

  const canControlVolume = isSelf || isHostView;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4" data-testid={`speaker-${peer.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/30 to-violet-600/30 text-sky-200">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
              <path d="M4 9v6h4l5 4V5L8 9H4z" />
              <path d="M16.5 8.5a5 5 0 0 1 0 7" />
            </svg>
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">
              {peer.name}
              {isSelf ? <span className="ml-1.5 text-xs font-normal text-slate-500">(this device)</span> : null}
            </p>
            <p className="truncate text-xs text-slate-500">
              {peer.isHost ? "Host" : "Receiver"}
              {typeof peer.position === "number" ? ` · ${peer.position.toFixed(1)}s` : ""}
            </p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusColor}`}>
          {peer.connectionState}
        </span>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onMuteToggle(peer.id)}
          disabled={!canControlVolume}
          aria-label={peer.muted ? "Unmute speaker" : "Mute speaker"}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {peer.muted ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M3 3l18 18M9 9v3H5V9h4l5-4v7M9 15v4l5-4" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M4 9v6h4l5 4V5L8 9H4zM16.5 8.5a5 5 0 0 1 0 7" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={peer.volume}
          disabled={!canControlVolume}
          onChange={(event) => onVolumeChange(peer.id, Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label={`Volume for ${peer.name}`}
        />
        <span className="w-8 text-right font-mono text-[11px] text-slate-400">{Math.round(peer.volume * 100)}</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
        <label className="flex items-center gap-2">
          <span>Latency offset</span>
          <input
            type="number"
            min={0}
            max={1000}
            step={10}
            value={peer.latencyOffsetMs}
            onChange={(event) => onLatencyChange(peer.id, Math.max(0, Number(event.target.value)))}
            className="w-16 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-right font-mono text-xs text-slate-200 outline-none focus:border-sky-400/60"
            aria-label={`Latency offset for ${peer.name}`}
          />
          <span>ms</span>
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono">{formatMs(peer.rttMs)}</span>
          {isHostView && !peer.isHost ? (
            <button
              type="button"
              onClick={() => onDisconnect(peer.id)}
              className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-2 py-1 text-[11px] font-semibold text-rose-300 transition hover:bg-rose-400/20"
            >
              Disconnect
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
