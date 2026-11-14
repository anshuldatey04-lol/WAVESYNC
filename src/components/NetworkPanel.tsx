import { useAppStore } from "../store/useAppStore";
import { formatMs } from "../lib/utils";

export default function NetworkPanel() {
  const network = useAppStore((state) => state.network);

  const connectionLabels: Record<string, string> = {
    unknown: "Unknown",
    lan: "LAN",
    webrc: "WebRTC",
    turn: "TURN relay",
    internet: "Internet",
    offline: "Offline",
  };

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl" data-testid="network-panel">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-widest text-slate-300">Network diagnostics</h3>
        <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-slate-300">
          {connectionLabels[network.connectionType] ?? "Unknown"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Latency (RTT)</p>
          <p className="mt-1 font-mono text-sm text-slate-200">{formatMs(network.rttMs)}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Jitter</p>
          <p className="mt-1 font-mono text-sm text-slate-200">{formatMs(network.jitterMs)}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">Packet loss</p>
          <p className="mt-1 font-mono text-sm text-slate-200">{network.packetLoss === null ? "—" : `${Math.round(network.packetLoss * 100)}%`}</p>
        </div>
        <div className="rounded-2xl border border-white/5 bg-black/30 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">ICE candidate</p>
          <p className="mt-1 font-mono text-sm text-slate-200">{network.candidateType ?? "—"}</p>
        </div>
      </div>

      <p className="mt-4 text-xs text-slate-500">Direct LAN / WebRTC / TURN measurements from live peer statistics. No simulated values are displayed.</p>
    </section>
  );
}
