import { useAppStore } from "../store/useAppStore";

const statusStyles: Record<string, string> = {
  disconnected: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  connecting: "bg-amber-400/15 text-amber-300 border-amber-400/30",
  connected: "bg-emerald-400/15 text-emerald-300 border-emerald-400/30",
};

export default function TopNav() {
  const screen = useAppStore((state) => state.screen);
  const setScreen = useAppStore((state) => state.setScreen);
  const connectionStatus = useAppStore((state) => state.connectionStatus);
  const mode = useAppStore((state) => state.mode);

  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a14]/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <button onClick={() => setScreen("home")} className="flex items-center gap-2.5" data-testid="brand">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-violet-600 shadow-[0_0_24px_rgba(56,189,248,0.45)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
              <rect x="4" y="14" width="16" height="4" rx="2" />
            </svg>
          </span>
          <span className="text-lg font-bold tracking-tight text-white">
            SYNC<span className="bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">WAVE</span>
          </span>
        </button>

        <nav className="flex items-center gap-2">
          <button
            onClick={() => setScreen("home")}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
              screen === "home" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
            }`}
          >
            Rooms
          </button>
          {mode ? (
            <button
              onClick={() => setScreen("room")}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-all ${
                screen === "room" ? "bg-white/10 text-white" : "text-slate-400 hover:text-white"
              }`}
            >
              Now Playing
            </button>
          ) : null}
        </nav>

        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${statusStyles[connectionStatus]}`}
            data-testid="connection-badge"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
            </span>
            {connectionStatus}
          </span>
        </div>
      </div>
    </header>
  );
}
