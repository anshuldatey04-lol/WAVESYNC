import { useCallback } from "react";
import { AudioEngine } from "../lib/audio/engine";
import { epochSecondsToAudioSeconds, getAudioContext, nowEpochSeconds } from "../lib/audio/context";
import { SYNC_LOOKAHEAD_SECONDS } from "../lib/config";

let sharedEngine: AudioEngine | null = null;

function getSharedEngine(): AudioEngine {
  if (!sharedEngine) {
    sharedEngine = new AudioEngine();
  }
  return sharedEngine;
}

export function useAudioEngine() {
  const getEngine = useCallback((): AudioEngine => getSharedEngine(), []);

  const loadFile = useCallback(async (file: File) => {
    const engine = getSharedEngine();
    return engine.loadFile(file);
  }, []);

  const playAtPosition = useCallback(
    (position: number, atEpochSeconds: number, latencyOffsetSeconds: number) => {
      const engine = getSharedEngine();
      const ctxTime = epochSecondsToAudioSeconds(atEpochSeconds) - latencyOffsetSeconds;
      engine.play(ctxTime, position);
      return ctxTime;
    },
    []
  );

  const pause = useCallback((atEpochSeconds?: number, latencyOffsetSeconds = 0) => {
    const engine = getSharedEngine();
    const ctxTime =
      atEpochSeconds === undefined ? undefined : epochSecondsToAudioSeconds(atEpochSeconds) - latencyOffsetSeconds;
    engine.pause(ctxTime);
  }, []);

  const stop = useCallback(() => {
    getSharedEngine().stop();
  }, []);

  const stopAt = useCallback((atEpochSeconds: number, latencyOffsetSeconds = 0) => {
    const engine = getSharedEngine();
    const ctxTime = epochSecondsToAudioSeconds(atEpochSeconds) - latencyOffsetSeconds;
    engine.stopAt(ctxTime);
  }, []);

  const seek = useCallback((position: number, atEpochSeconds: number, latencyOffsetSeconds: number) => {
    const engine = getSharedEngine();
    engine.stop();
    const ctxTime = epochSecondsToAudioSeconds(atEpochSeconds) - latencyOffsetSeconds;
    engine.play(ctxTime, position);
    return ctxTime;
  }, []);

  const getPosition = useCallback((): number => {
    const engine = getSharedEngine();
    return engine.isPlaying ? engine.getPosition() : 0;
  }, []);

  const getDuration = useCallback((): number => getSharedEngine().getDuration(), []);

  const schedulePlay = useCallback((position: number, _latencyOffsetSeconds: number) => {
    const ctx = getAudioContext();
    const ctxTime = ctx.currentTime + SYNC_LOOKAHEAD_SECONDS;
    getSharedEngine().play(ctxTime, position);
    return { ctxTime, position };
  }, []);

  const nowCtxSeconds = useCallback((): number => getAudioContext().currentTime, []);

  const currentTimeEpoch = useCallback((): number => nowEpochSeconds(), []);

  return {
    getEngine,
    loadFile,
    playAtPosition,
    pause,
    stop,
    stopAt,
    seek,
    getPosition,
    getDuration,
    schedulePlay,
    nowCtxSeconds,
    currentTimeEpoch,
  };
}

export type AudioEngineApi = ReturnType<typeof useAudioEngine>;
