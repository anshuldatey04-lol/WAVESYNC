export interface ClockSample {
  offsetSeconds: number;
  delaySeconds: number;
  jitterSeconds: number;
  samples: number;
}

interface PendingProbe {
  fromId: string;
  t1: number;
}

const MAX_SAMPLES = 24;

export class ClockEstimator {
  private pending = new Map<string, PendingProbe>();
  private offsetSamples: number[] = [];
  private delaySamples: number[] = [];

  sendProbe(fromId: string, epochSeconds: number): void {
    this.pending.set(fromId, { fromId, t1: epochSeconds });
  }

  receiveReply(fromId: string, t3: number, echoT1: number, now: number): ClockSample | null {
    const pending = this.pending.get(fromId);
    if (!pending || pending.t1 !== echoT1) return null;
    this.pending.delete(fromId);

    const t1 = pending.t1;
    const t4 = now;
    const offset = t3 - (t1 + t4) / 2;
    const delay = (t4 - t1) / 2;
    if (delay < 0 || delay > 5) return null;
    this.pushSample(offset, delay);

    return this.compute();
  }

  getSample(): ClockSample | null {
    if (this.offsetSamples.length === 0) return null;
    return this.compute();
  }

  clear(): void {
    this.pending.clear();
    this.offsetSamples = [];
    this.delaySamples = [];
  }

  private compute(): ClockSample {
    const recentOffset = this.offsetSamples.slice(-MAX_SAMPLES);
    const recentDelay = this.delaySamples.slice(-MAX_SAMPLES);
    const meanOffset = recentOffset.reduce((acc, v) => acc + v, 0) / recentOffset.length;
    const meanDelay = recentDelay.reduce((acc, v) => acc + v, 0) / recentDelay.length;
    const jitter =
      recentDelay.length === 0
        ? 0
        : Math.sqrt(
            recentDelay.reduce((acc, v) => acc + (v - meanDelay) * (v - meanDelay), 0) / recentDelay.length
          );
    return { offsetSeconds: meanOffset, delaySeconds: meanDelay, jitterSeconds: jitter, samples: recentOffset.length };
  }

  private pushSample(offset: number, delay: number): void {
    this.offsetSamples.push(offset);
    this.delaySamples.push(delay);
    if (this.offsetSamples.length > MAX_SAMPLES) this.offsetSamples.shift();
    if (this.delaySamples.length > MAX_SAMPLES) this.delaySamples.shift();
  }
}
