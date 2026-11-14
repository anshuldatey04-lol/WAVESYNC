import { useAppStore } from "../store/useAppStore";
import { formatTime } from "../lib/utils";

interface PlayerControlsProps {
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onSeek: (position: number) => void;
}

export default function PlayerControls({ disabled = false, onPlay, onPause, onStop, onSeek }: PlayerControlsProps) {
  const playback = useAppStore((state) => state.playback);
  const audio = useAppStore((state) => state.audio);
  const audioStatus = useAppStore((state) => state.audioStatus);
  const hasAudio = audio !== null;
  const playing = audioStatus === "playing";
  const duration = audio?.duration ?? 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="player-controls">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          {!playing ? (
            <button
              onClick={onPlay}
              disabled={disabled || !hasAudio}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-violet-500 text-black shadow-[0_0_30px_rgba(56,189,248,0.5)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
              data-testid="play-button"
              aria-label="Play"
            >
              <svg viewBox="0 0 24 24" className="ml-1 h-6 w-6 fill-current">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>
          ) : (
            <button
              onClick={onPause}
              disabled={disabled}
              className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="pause-button"
              aria-label="Pause"
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current">
                <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
              </svg>
            </button>
          )}
          <button
            onClick={onStop}
            disabled={disabled || !hasAudio || audioStatus === "stopped" || audioStatus === "idle"}
            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-white/5 text-slate-300 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="stop-button"
            aria-label="Stop"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
              <rect x="6" y="6" width="12" height="12" rx="1.5" />
            </svg>
          </button>
        </div>

        <div className="flex flex-1 items-center gap-3">
          <span className="w-12 text-right font-mono text-xs text-slate-400">{formatTime(playback.position)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.01}
            value={Math.min(playback.position, Math.max(duration, 0.1))}
            disabled={disabled || !hasAudio}
            onChange={(event) => onSeek(Number(event.target.value))}
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="seek-slider"
            aria-label="Seek"
          />
          <span className="w-12 text-left font-mono text-xs text-slate-400">{formatTime(duration)}</span>
        </div>
      </div>

      {disabled ? (
        <p className="mt-3 text-xs text-slate-500">Playback is controlled by the host device. You can adjust your speaker volume below.</p>
      ) : !hasAudio ? (
        <p className="mt-3 text-xs text-slate-500">Upload an authorized audio file to start a synchronized session.</p>
      ) : null}
    </section>
  );
}
