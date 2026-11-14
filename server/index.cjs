const express = require("express");
const http = require("node:http");
const os = require("node:os");
const { Server } = require("socket.io");
const cors = require("cors");
const path = require("node:path");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");

const ROOM_TTL_MS = Number(process.env.SYNCWAVE_ROOM_TTL_MS ?? 30 * 60 * 1000);
const MAX_AUDIO_BYTES = 64 * 1024 * 1024;
const CLIENT_DIST = path.join(__dirname, "..", "dist");

const rooms = new Map();

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "64mb" }));

function publicPeer(peerId, isHost, name) {
  return {
    id: peerId,
    name: name ?? (isHost ? "Host device" : `Speaker ${peerId.slice(-4).toUpperCase()}`),
    isHost,
    role: isHost ? "host" : "receiver",
  };
}

function roomPeers(room) {
  const peers = Array.from(room.peers)
    .filter((id) => id !== room.hostId)
    .map((id) => publicPeer(id, false));
  return [publicPeer(room.hostId, true, room.hostName), ...peers];
}

function roomAudioPayload(room) {
  if (!room.audio) return null;
  return {
    name: room.audio.name,
    duration: room.audio.duration,
    size: room.audio.size,
    data: room.audio.data,
  };
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "syncwave-signaling",
    rooms: rooms.size,
    timestamp: Date.now(),
  });
});

app.get("/api/network", (_req, res) => {
  const addresses = [];
  for (const infos of Object.values(os.networkInterfaces())) {
    for (const info of infos ?? []) {
      if (info.family === "IPv4" && !info.internal) {
        addresses.push(info.address);
      }
    }
  }
  addresses.sort((a, b) => {
    const score = (address) =>
      address.startsWith("192.168.") ? 0 : address.startsWith("10.") ? 1 : 2;
    return score(a) - score(b);
  });
  const address = server.address();
  res.json({
    port: typeof address === "object" && address ? address.port : 8787,
    addresses,
  });
});

app.post("/api/rooms/:roomId/audio", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "ROOM_NOT_FOUND" });
    return;
  }
  if (req.get("x-syncwave-host-token") !== room.hostToken) {
    res.status(403).json({ error: "HOST_TOKEN_REQUIRED" });
    return;
  }
  const { name, duration, data } = req.body ?? {};
  if (typeof data !== "string" || typeof name !== "string" || data.length === 0) {
    res.status(400).json({ error: "INVALID_AUDIO_PAYLOAD" });
    return;
  }
  if (data.length > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: "AUDIO_TOO_LARGE" });
    return;
  }
  room.audio = {
    name,
    duration: Number(duration) || 0,
    size: Buffer.byteLength(data, "base64"),
    data,
    updatedAt: Date.now(),
  };
  res.json({ ok: true, name: room.audio.name, duration: room.audio.duration, size: room.audio.size });
});

app.get("/api/rooms/:roomId/audio", (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    res.status(404).json({ error: "ROOM_NOT_FOUND" });
    return;
  }
  const payload = roomAudioPayload(room);
  if (!payload) {
    res.status(404).json({ error: "AUDIO_NOT_READY" });
    return;
  }
  res.json(payload);
});

const server = http.createServer(app);
const io = new Server(server, {
  path: "/syncwave",
  cors: { origin: true, credentials: true },
  maxHttpBufferSize: 1e7,
});

function departRoom(socketId) {
  for (const room of Array.from(rooms.values())) {
    if (!room.peers.has(socketId)) continue;
    room.peers.delete(socketId);

    if (room.hostId === socketId) {
      io.to(room.id).emit("room:closed", { roomId: room.id, reason: "HOST_LEFT" });
      rooms.delete(room.id);
      return;
    }

    io.to(room.id).emit("peer:removed", { roomId: room.id, peerId: socketId });
    const hostSocket = io.sockets.sockets.get(room.hostId);
    if (hostSocket) {
      hostSocket.emit("peer:removed", { roomId: room.id, peerId: socketId });
    }
    if (room.peers.size === 0) {
      rooms.delete(room.id);
    }
    return;
  }
}

setInterval(() => {
  const now = Date.now();
  for (const room of Array.from(rooms.values())) {
    if (now - room.createdAt > ROOM_TTL_MS) {
      io.to(room.id).emit("room:closed", { roomId: room.id, reason: "EXPIRED" });
      rooms.delete(room.id);
    }
  }
}, 30000).unref();

io.on("connection", (socket) => {
  socket.on("room:create", (payload) => {
    const requested = typeof payload?.roomId === "string" ? payload.roomId.trim().toUpperCase() : "";
    let roomId = requested || `SYNC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    while (rooms.has(roomId)) {
      roomId = `SYNC-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }
    const room = {
      id: roomId,
      hostId: socket.id,
      hostName: payload?.name ? String(payload.name) : "Host device",
      peers: new Set([socket.id]),
      createdAt: Date.now(),
      audio: null,
      hostToken: randomUUID(),
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit("room:created", {
      roomId,
      hostId: socket.id,
      hostToken: room.hostToken,
      peers: roomPeers(room),
      roomName: room.hostName,
    });
  });

  socket.on("room:join", (payload) => {
    const roomId = String(payload?.roomId ?? "").trim().toUpperCase();
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", { code: "ROOM_NOT_FOUND", message: "Room does not exist or has expired." });
      return;
    }
    room.peers.add(socket.id);
    socket.join(roomId);
    socket.emit("room:state", {
      roomId,
      hostPeerId: room.hostId,
      peers: roomPeers(room),
      roomName: room.hostName,
    });
    const hostSocket = io.sockets.sockets.get(room.hostId);
    if (hostSocket) {
      hostSocket.emit("peer:joined", { roomId, peer: publicPeer(socket.id, false) });
    }
  });

  socket.on("room:leave", () => {
    departRoom(socket.id);
  });

  socket.on("playback:command", (payload) => {
    const room = rooms.get(String(payload?.roomId ?? ""));
    if (!room || !room.peers.has(socket.id)) return;
    const target = io.sockets.sockets.get(String(payload?.to ?? ""));
    if (!target || !room.peers.has(target.id)) return;
    target.emit("playback:command", {
      from: socket.id,
      to: target.id,
      payload: payload?.payload,
    });
  });

  socket.on("signal", (payload) => {
    const room = rooms.get(String(payload?.roomId ?? ""));
    if (!room || !room.peers.has(socket.id)) return;
    const target = io.sockets.sockets.get(String(payload?.to ?? ""));
    if (!target || !room.peers.has(target.id)) return;
    target.emit("signal", {
      kind: payload?.kind,
      peerId: socket.id,
      data: payload?.data,
    });
  });

  socket.on("disconnect", () => {
    departRoom(socket.id);
  });
});

if (fs.existsSync(path.join(CLIENT_DIST, "index.html"))) {
  app.use(express.static(CLIENT_DIST));
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(CLIENT_DIST, "index.html"));
  });
}

function startServer(port = Number(process.env.PORT ?? 8787)) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.off("error", onError);
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`SYNCWAVE signaling server listening on http://localhost:${actualPort}`);
      resolve(actualPort);
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Failed to start SYNCWAVE server:", error);
    process.exitCode = 1;
  });
}

module.exports = { app, server, io, rooms, startServer };
