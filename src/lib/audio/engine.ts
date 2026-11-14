import { epochSecondsToAudioSeconds, getAudioContext, ctxSecondsToEpoch } from "./context";

export class AudioEngine {
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private sourceStartCtxSeconds = 0;
  private sourceOffsetSeconds = 0;

  private ensureContext(): AudioContext {
    const ctx = getAudioContext();
    if (ctx.state !== "running") {
      void ctx.resume();
    }
    return ctx;
  }

  async loadFile(file: File): Promise<{ buffer: AudioBuffer; duration: number }> {
    const arrayBuffer = await file.arrayBuffer();
    const ctx = this.ensureContext();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    this.buffer = buffer;
    this.sourceOffsetSeconds = 0;
    return { buffer, duration: buffer.duration };
  }

  async loadBuffer(buffer: AudioBuffer): Promise<{ buffer: AudioBuffer; duration: number }> {
    this.buffer = buffer;
    this.sourceOffsetSeconds = 0;
    return { buffer, duration: buffer.duration };
  }

  getDuration(): number {
    return this.buffer?.duration ?? 0;
  }

  getCurrentBuffer(): AudioBuffer | null {
    return this.buffer;
  }

  play(atCtxSeconds: number, offsetSeconds = 0, gainValue = 1): void {
    const ctx = this.ensureContext();
    const previous = this.source;
    if (previous) {
      const stopAt = Math.max(ctx.currentTime, atCtxSeconds);
      try {
        previous.stop(stopAt);
      } catch {
        // already stopped
      }
      previous.onended = () => previous.disconnect();
    }
    const next = ctx.createBufferSource();
    next.buffer = this.buffer;
    if (!next.buffer) return;
    const clampedOffset = Math.max(0, Math.min(offsetSeconds, next.buffer.duration - 0.02));
    const duration = Math.max(next.buffer.duration - clampedOffset, 0.02);
    const gainNode = ctx.createGain();
    gainNode.gain.value = gainValue;
    next.connect(gainNode);
    gainNode.connect(ctx.destination);
    next.onended = () => {
      next.disconnect();
      if (this.source === next) {
        this.source = null;
        this.gainNode = null;
        this.sourceOffsetSeconds = 0;
      }
    };
    next.start(Math.max(ctx.currentTime, atCtxSeconds), clampedOffset, duration);
    this.source = next;
    this.gainNode = gainNode;
    this.sourceStartCtxSeconds = Math.max(ctx.currentTime, atCtxSeconds);
    this.sourceOffsetSeconds = clampedOffset;
  }

  setGain(value: number): void {
    const ctx = this.ensureContext();
    if (this.gainNode) {
      this.gainNode.gain.setTargetAtTime(value, ctx.currentTime, 0.03);
    }
  }

  pause(atCtxSeconds?: number): void {
    const ctx = this.ensureContext();
    const source = this.source;
    if (!source) return;
    const stopTime = Math.max(atCtxSeconds ?? ctx.currentTime, ctx.currentTime + 0.01);
    const elapsed = Math.max(0, stopTime - this.sourceStartCtxSeconds);
    this.sourceOffsetSeconds = Math.min(this.sourceOffsetSeconds + elapsed, this.buffer?.duration ?? this.sourceOffsetSeconds);
    try {
      source.stop(stopTime);
    } catch {
      // already stopped
    }
    source.onended = () => source.disconnect();
    this.source = null;
    this.gainNode = null;
  }

  stop(): void {
    const ctx = this.ensureContext();
    const source = this.source;
    if (!source) return;
    try {
      source.stop(ctx.currentTime + 0.01);
    } catch {
      // already stopped
    }
    source.onended = () => source.disconnect();
    this.source = null;
    this.gainNode = null;
    this.sourceOffsetSeconds = 0;
  }

  stopAt(atCtxSeconds: number): void {
    const source = this.source;
    if (!source) return;
    try {
      source.stop(Math.max(atCtxSeconds, getAudioContext().currentTime));
    } catch {
      // already stopped
    }
    source.onended = () => source.disconnect();
    this.source = null;
    this.gainNode = null;
    this.sourceOffsetSeconds = 0;
  }

  getPosition(): number {
    if (!this.source) return this.sourceOffsetSeconds;
    const ctx = getAudioContext();
    const elapsed = Math.max(0, ctx.currentTime - this.sourceStartCtxSeconds);
    const duration = this.buffer?.duration ?? 0;
    return Math.min(this.sourceOffsetSeconds + elapsed, duration);
  }

  get isPlaying(): boolean {
    return this.source !== null;
  }
}

export { ctxSecondsToEpoch, epochSecondsToAudioSeconds };
