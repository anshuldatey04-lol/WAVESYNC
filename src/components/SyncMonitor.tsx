import { useAppStore } from "../store/useAppStore";
import { formatMs } from "../lib/utils";

export default function SyncMonitor() {
  const sync = useAppStore((state) => state.sync);
  const audioStatus = useAppStore((state) => state.audioStatus);

  const qualityStyles: Record<string, string> = {
    unknown: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    good: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
    poor: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  };

  const hasSamples = sync.offsetSamples > 0;

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="sync-monitor">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Clock sync</h3>
        <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${qualityStyles[sync.quality]}`}>
          {hasSamples ? sync.quality : "measuring"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Clock offset</p>
          <p className="mt-1 font-mono text-sm text-slate-200" data-testid="clock-offset">
            {hasSamples ? formatMs(sync.offsetSeconds * 1000) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">One-way delay</p>
          <p className="mt-1 font-mono text-sm text-slate-200">
            {hasSamples ? formatMs(sync.delaySeconds * 1000) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Jitter</p>
          <p className="mt-1 font-mono text-sm text-slate-200">
            {hasSamples ? formatMs(sync.jitterSeconds * 1000) : "—"}
          </p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Drift</p>
          <p className="mt-1 font-mono text-sm text-slate-200" data-testid="sync-drift">
            {audioStatus === "playing" ? formatMs(sync.driftPerSecond * 1000) : "—"}
          </p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">
        Measured with NTP-style WebRTC data-channel probes every 2 seconds ({sync.offsetSamples} samples). Playback is
        scheduled ahead of time using the averaged offset, so all speakers start on the same clock tick.
      </p>
    </section>
  );
}
