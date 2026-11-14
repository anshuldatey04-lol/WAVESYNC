import { useAppStore } from "../store/useAppStore";

export default function NowPlaying() {
  const audio = useAppStore((state) => state.audio);
  const audioStatus = useAppStore((state) => state.audioStatus);

  const statusLabel = audioStatus === "playing" ? "Playing" : audioStatus === "paused" ? "Paused" : audioStatus === "stopped" ? "Stopped" : "Ready";

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="now-playing">
      <div className="flex items-center gap-5">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-sky-500/40 via-violet-600/40 to-black">
          <div className="absolute inset-0 flex items-center justify-center">
            <svg viewBox="0 0 24 24" className="h-10 w-10 text-white/80" fill="currentColor">
              <path d="M9 18V6l12-2v12" />
            </svg>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-widest text-sky-400">Now playing</p>
          <h2 className="mt-1 truncate text-2xl font-bold text-white" data-testid="track-title">
            {audio?.name ?? "No track loaded"}
          </h2>
          <p className="mt-1 text-sm text-slate-400">SYNCWAVE synchronized playback</p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                audioStatus === "playing" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-white/10 bg-white/5 text-slate-300"
              }`}
            >
              {statusLabel}
            </span>
            <span className="text-xs text-slate-500">{audio ? `${audio.duration.toFixed(1)}s` : "--:--"}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
