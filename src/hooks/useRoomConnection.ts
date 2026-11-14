import { useEffect } from "react";
import {
  broadcastToReceivers,
  createRoom,
  disconnectSpeaker,
  ensureRoomConnection,
  getClockEstimator,
  getRoomManager,
  joinRoom,
  leaveRoom,
  registerRoomEvents,
  sendAudioMeta,
  sendControl,
  startClockProbes,
  stopClockProbes,
  type RoomEvents,
} from "../lib/room/connection";

export type { RoomEvents };

const api = {
  createRoom,
  joinRoom,
  leaveRoom,
  sendControl,
  broadcastToReceivers,
  sendAudioMeta,
  disconnectSpeaker,
  startClockProbes,
  stopClockProbes,
  registerRoomEvents,
  getManager: getRoomManager,
  getEstimator: getClockEstimator,
};

export function useRoomConnection() {
  useEffect(() => {
    ensureRoomConnection();
  }, []);
  return api;
}

export function useRoomEvents(events: RoomEvents) {
  useEffect(() => {
    registerRoomEvents(events);
    return () => registerRoomEvents(null);
  }, [events]);
}

export type RoomConnectionApi = typeof api;
