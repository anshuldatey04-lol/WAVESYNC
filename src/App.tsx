import { useEffect } from "react";
import TopNav from "./components/TopNav";
import HomeScreen from "./components/HomeScreen";
import RoomScreen from "./components/RoomScreen";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const screen = useAppStore((state) => state.screen);

  useEffect(() => {
    document.title = "SYNCWAVE — Multi-Device Wireless Speaker Sync";
  }, []);

  return (
    <div className="min-h-screen bg-[#07070d] text-slate-100 antialiased">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.12),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.10),transparent_55%)]" />
      <div className="relative">
        <TopNav />
        {screen === "home" ? <HomeScreen /> : <RoomScreen />}
      </div>
    </div>
  );
}
