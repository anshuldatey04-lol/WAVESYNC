import type { PeerInfo } from "../types/room";
import SpeakerCard from "./SpeakerCard";

interface SpeakerGridProps {
  peers: PeerInfo[];
  selfPeerId: string | null;
  isHostView: boolean;
  onVolumeChange: (peerId: string, volume: number) => void;
  onMuteToggle: (peerId: string) => void;
  onLatencyChange: (peerId: string, latencyOffsetMs: number) => void;
  onDisconnect: (peerId: string) => void;
}

export default function SpeakerGrid({
  peers,
  selfPeerId,
  isHostView,
  onVolumeChange,
  onMuteToggle,
  onLatencyChange,
  onDisconnect,
}: SpeakerGridProps) {
  if (peers.length === 0) {
    return <p className="text-sm text-slate-500">No speakers connected yet.</p>;
  }

  return (
    <div className="space-y-3">
      {peers.map((peer) => (
        <SpeakerCard
          key={peer.id}
          peer={peer}
          isSelf={peer.id === selfPeerId}
          isHostView={isHostView}
          onVolumeChange={onVolumeChange}
          onMuteToggle={onMuteToggle}
          onLatencyChange={onLatencyChange}
          onDisconnect={onDisconnect}
        />
      ))}
    </div>
  );
}
