import { useEffect } from "react";
import { useAppStore } from "../store/useAppStore";
import { getRoomManager } from "../lib/room/connection";
import type { NetworkMetrics } from "../types/sync";

function connectionTypeFor(candidateType: string | null): NetworkMetrics["connectionType"] {
  if (candidateType === "relay") return "turn";
  if (candidateType === "host") return "lan";
  if (candidateType === "srflx" || candidateType === "prflx") return "internet";
  return "webrc";
}

export function useNetworkMonitor(peerId: string | null): void {
  useEffect(() => {
    if (!peerId) return;
    let cancelled = false;

    const poll = async () => {
      const stats = await getRoomManager()
        .getStats(peerId)
        .catch(() => null);
      if (cancelled || !stats) return;
      const state = useAppStore.getState();
      const rttMs = stats.roundTripTimeSeconds === null ? null : stats.roundTripTimeSeconds * 1000;
      const jitterMs = stats.jitterSeconds === null ? null : stats.jitterSeconds * 1000;
      state.setNetwork({
        connectionType:
          stats.state === "connected" || stats.state === "connecting"
            ? connectionTypeFor(stats.candidateType)
            : "unknown",
        rttMs,
        jitterMs,
        packetLoss: stats.packetLoss,
        candidateType: stats.candidateType,
        iceState: stats.state,
        uplink: null,
        downlink: null,
        updatedAt: Date.now(),
      });
      const peer = state.peers[peerId];
      if (peer) {
        state.upsertPeer({
          ...peer,
          rttMs: rttMs ?? undefined,
          jitterMs: jitterMs ?? undefined,
          packetLoss: stats.packetLoss ?? undefined,
        });
      }
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [peerId]);
}
