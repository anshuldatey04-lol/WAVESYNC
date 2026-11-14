import { useEffect, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useRoomConnection } from "../hooks/useRoomConnection";

export default function HomeScreen() {
  const error = useAppStore((state) => state.error);
  const setError = useAppStore((state) => state.setError);
  const { createRoom, joinRoom } = useRoomConnection();
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const room = params.get("room");
    if (room) setRoomCode(room.toUpperCase());
  }, []);

  const handleCreate = () => {
    setError(null);
    createRoom();
  };

  const handleJoin = () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length < 3) {
      setError("Enter a valid SYNCWAVE room code.");
      return;
    }
    setError(null);
    joinRoom(code);
  };

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-16 sm:px-6">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1 text-xs font-medium text-sky-300">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
          Multi-device synchronized playback
        </p>
        <h1 className="text-5xl font-black tracking-tight text-white sm:text-6xl">Play together, everywhere.</h1>
        <p className="mt-5 text-lg text-slate-400">
          SYNCWAVE turns one authorized audio file into perfectly timed playback across every connected speaker.
        </p>
      </div>

      <div className="mx-auto mt-12 max-w-4xl">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 backdrop-blur-xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <button
              onClick={handleCreate}
              className="rounded-2xl border border-sky-400/30 bg-gradient-to-br from-sky-500/20 to-violet-600/20 p-6 text-left transition-transform hover:-translate-y-0.5"
              data-testid="create-room-button"
            >
              <p className="text-lg font-semibold text-white">Create a room</p>
              <p className="mt-1 text-sm text-slate-300">You host the audio. Get a QR code and share it.</p>
            </button>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-left">
              <p className="text-lg font-semibold text-white">Join a room</p>
              <div className="mt-2 flex gap-2">
                <input
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleJoin();
                  }}
                  placeholder="e.g. SYNC-AB12CD"
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-white outline-none focus:border-sky-400/60"
                  data-testid="room-code-input"
                />
                <button
                  onClick={handleJoin}
                  className="rounded-xl bg-sky-500/90 px-4 text-sm font-semibold text-black hover:bg-sky-400"
                  data-testid="join-room-submit"
                >
                  Join
                </button>
              </div>
            </div>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-300" data-testid="home-error">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {[
            {
              title: "1 · Host uploads",
              body: "The host device decodes an authorized audio file locally and serves it to the room.",
            },
            {
              title: "2 · Speakers join",
              body: "Receivers connect over WebRTC data channels and synchronize clocks with NTP-style probes.",
            },
            {
              title: "3 · One clock",
              body: "Playback is scheduled 2 seconds ahead on every device using the shared clock offset.",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
