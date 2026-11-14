import { io } from "socket.io-client";

const BASE = "http://localhost:8787";
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
};

const waitFor = (socket, event, timeout = 3000) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

const health = await fetch(`${BASE}/api/health`).then((r) => r.json());
check("health endpoint", health.ok === true);

const notFound = await fetch(`${BASE}/api/rooms/NOPE/audio`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
check("audio POST rejects unknown room", notFound.status === 404);

const host = io(BASE, { path: "/syncwave", transports: ["websocket"] });
const receiver = io(BASE, { path: "/syncwave", transports: ["websocket"] });
await Promise.all([waitFor(host, "connect"), waitFor(receiver, "connect")]);
check("sockets connected", host.connected && receiver.connected);

host.emit("room:create", { name: "Smoke Host" });
const created = await waitFor(host, "room:created");
check("room created", typeof created.roomId === "string" && created.hostId === host.id, created.roomId);

const audioData = Buffer.from("syncwave-smoke-audio").toString("base64");
const forbidden = await fetch(`${BASE}/api/rooms/${created.roomId}/audio`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ name: "smoke.mp3", duration: 1.5, data: audioData }),
});
check("audio upload requires host token", forbidden.status === 403);

const uploadResponse = await fetch(`${BASE}/api/rooms/${created.roomId}/audio`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-syncwave-host-token": created.hostToken },
  body: JSON.stringify({ name: "smoke.mp3", duration: 1.5, data: audioData }),
});
const upload = await uploadResponse.json();
check("audio upload", uploadResponse.ok && upload.ok === true);

const download = await fetch(`${BASE}/api/rooms/${created.roomId}/audio`).then((r) => r.json());
check("audio download", download.data === audioData && download.name === "smoke.mp3");

const hostPeerJoined = waitFor(host, "peer:joined");
receiver.emit("room:join", { roomId: created.roomId });
const state = await waitFor(receiver, "room:state");
const joined = await hostPeerJoined;
check("receiver joined", state.roomId === created.roomId && state.peers.some((p) => p.isHost));
check("host notified of receiver", joined.peer.id === receiver.id);

const signalReceived = waitFor(host, "signal");
receiver.emit("signal", { roomId: created.roomId, from: receiver.id, to: host.id, kind: "offer", data: { type: "offer", sdp: "v=0" } });
const relayed = await signalReceived;
check("signal relay", relayed.kind === "offer" && relayed.peerId === receiver.id && relayed.data.sdp === "v=0");

const closed = waitFor(receiver, "room:closed");
host.disconnect();
const closedPayload = await closed;
check("room closed on host disconnect", closedPayload.reason === "HOST_LEFT");
receiver.disconnect();

const failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} checks passed`);
process.exit(failures === 0 ? 0 : 1);
