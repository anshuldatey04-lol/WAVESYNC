let audioContext: AudioContext | null = null;
let contextStartPerformanceSeconds = 0;

function syncContextOffset(): void {
  if (!audioContext) return;
  contextStartPerformanceSeconds = performance.now() / 1000 - audioContext.currentTime;
}

function getContext(): AudioContext {
  if (!audioContext) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      throw new Error("Web Audio API is not supported in this browser");
    }
    audioContext = new Ctor();
    syncContextOffset();
  }
  const ctx = audioContext;
  if (ctx.state === "suspended") {
    void ctx.resume().then(syncContextOffset);
  } else if (ctx.state === "running") {
    syncContextOffset();
  }
  return ctx;
}

export function getAudioContext(): AudioContext {
  return getContext();
}

export function audioContextState(): AudioContextState {
  return getContext().state;
}

export function nowEpochSeconds(): number {
  return performance.now() / 1000;
}

export function nowAudioSeconds(): number {
  return getContext().currentTime;
}

export function epochSecondsToAudioSeconds(epochSeconds: number): number {
  return epochSeconds - contextStartPerformanceSeconds;
}

export function getContextStartEpochSeconds(): number {
  return contextStartPerformanceSeconds;
}

export function ctxSecondsToEpoch(ctxSeconds: number): number {
  return ctxSeconds + contextStartPerformanceSeconds;
}

export function resumeAudioContext(): Promise<void> {
  const ctx = getContext();
  return ctx.resume().then(syncContextOffset);
}

export function closeAudioContext(): void {
  if (audioContext) {
    void audioContext.close();
    audioContext = null;
  }
}
