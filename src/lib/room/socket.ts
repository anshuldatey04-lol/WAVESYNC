import { io, type Socket } from "socket.io-client";
import { SYNCWAVE_SERVER_URL } from "../config";

let socket: Socket | null = null;

export function getSyncSocket(): Socket {
  if (!socket) {
    socket = io(SYNCWAVE_SERVER_URL, {
      path: "/syncwave",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      withCredentials: false,
    });
  }
  return socket;
}

export function connectSyncSocket(): Socket {
  const s = getSyncSocket();
  if (!s.connected) {
    s.connect();
  }
  return s;
}

export function disconnectSyncSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
