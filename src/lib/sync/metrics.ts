import type { SyncQuality } from "../../types/room";

export interface QualityInput {
  offsetSeconds: number;
  delaySeconds: number;
  jitterSeconds: number;
  packetLoss: number;
}

export function evaluateSyncQuality(input: QualityInput): SyncQuality {
  const { offsetSeconds, delaySeconds, jitterSeconds, packetLoss } = input;
  const offsetOk = Math.abs(offsetSeconds) < 0.15;
  const delayOk = delaySeconds < 0.25;
  const jitterOk = jitterSeconds < 0.15;
  const lossOk = packetLoss < 0.05;
  const healthy = offsetOk && delayOk && jitterOk && lossOk;
  if (healthy) return "good";
  if (offsetSeconds > 0.15 || delaySeconds > 0.5 || packetLoss > 0.2) return "poor";
  return "poor";
}

export interface DriftResult {
  driftPerSecond: number;
  resyncRequired: boolean;
}

export function evaluateDrift(currentDrift: number, previousDrift: number): DriftResult {
  const driftPerSecond = currentDrift - previousDrift;
  const resyncRequired = Math.abs(currentDrift) > 0.05;
  return { driftPerSecond, resyncRequired };
}

export function computePacketLoss(lostProbes: number, totalProbes: number): number {
  if (totalProbes <= 0) return 0;
  return Math.min(lostProbes / totalProbes, 1);
}
