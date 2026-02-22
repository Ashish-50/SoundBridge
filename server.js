const path = require("path");
const http = require("http");
const express = require("express");
const { WebSocketServer } = require("ws");
const QRCode = require("qrcode");
require("dotenv").config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const rooms = new Map();

function createClientId() {
  return Math.random().toString(36).slice(2, 8);
}

function getRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, { clients: new Map(), state: null, src: null });
  }
  return rooms.get(roomId);
}

function broadcast(room, data, excludeId) {
  const payload = JSON.stringify(data);
  for (const client of room.clients.values()) {
    if (client.ws.readyState === 1 && client.id !== excludeId) {
      client.ws.send(payload);
    }
  }
}

function sendPresence(room) {
  const listeners = Array.from(room.clients.values()).map((client) => ({
    id: client.id,
    userAgent: client.userAgent,
    ip: client.ip,
  }));

  for (const client of room.clients.values()) {
    if (client.ws.readyState !== 1) continue;
    client.ws.send(
      JSON.stringify({
        type: "presence",
        roomId: client.roomId,
        you: client.id,
        listeners,
      }),
    );
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", true);
}

function renderIndex(req, res) {
  res.render("index", {
    defaultTrackUrl:
      process.env.DEFAULT_TRACK_URL ||
      "https://upload.wikimedia.org/wikipedia/commons/6/63/Sagetyrtle_-_citystreet3_%28cc0%29_%28freesound%29.mp3",
  });
}

app.get("/room/:id", (req, res) => {
  renderIndex(req, res);
});

app.get("/", (req, res) => {
  renderIndex(req, res);
});

app.get("/qr", async (req, res) => {
  const roomId = (req.query.room || "lobby").toString();
  const baseUrl =
    process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`;
  const roomUrl = `${baseUrl.replace(/\/$/, "")}/room/${encodeURIComponent(roomId)}`;
  try {
    const svg = await QRCode.toString(roomUrl, {
      type: "svg",
      margin: 1,
      width: 220,
    });
    res.type("image/svg+xml").send(svg);
  } catch (err) {
    res.status(500).send("QR generation failed");
  }
});

function getClientIp(req) {
  if (process.env.TRUST_PROXY === "true") {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length) {
      return forwarded.split(",")[0].trim();
    }
  }
  return req.socket.remoteAddress || "";
}

wss.on("connection", (ws, req) => {
  const host = req.headers.host || "localhost";
  const url = new URL(req.url, `http://${host}`);
  const roomId = url.searchParams.get("room") || "lobby";
  const room = getRoom(roomId);

  const client = {
    id: createClientId(),
    ws,
    roomId,
    userAgent: req.headers["user-agent"] || "Unknown",
    ip: getClientIp(req),
  };

  room.clients.set(client.id, client);

  if (room.src) {
    ws.send(JSON.stringify({ type: "src", roomId, src: room.src }));
  }

  if (room.state) {
    ws.send(
      JSON.stringify({
        type: "state",
        roomId,
        playing: room.state.playing,
        time: room.state.time,
        serverTime: room.state.serverTime,
      }),
    );
  }

  sendPresence(room);

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      return;
    }

    if (!msg || msg.roomId !== roomId) {
      return;
    }

    if (msg.type === "src" && typeof msg.src === "string") {
      room.src = msg.src;
      room.state = {
        playing: false,
        time: 0,
        serverTime: Date.now(),
      };
      broadcast(room, { type: "src", roomId, src: room.src }, client.id);
      broadcast(
        room,
        {
          type: "state",
          roomId,
          playing: false,
          time: 0,
          serverTime: room.state.serverTime,
        },
        client.id,
      );
      return;
    }

    if (msg.type === "state") {
      const time = Number(msg.time);
      const playing = Boolean(msg.playing);
      if (!Number.isFinite(time)) {
        return;
      }

      room.state = {
        playing,
        time,
        serverTime: Date.now(),
      };

      broadcast(
        room,
        {
          type: "state",
          roomId,
          playing,
          time,
          serverTime: room.state.serverTime,
        },
        client.id,
      );
    }
  });

  ws.on("close", () => {
    room.clients.delete(client.id);
    if (room.clients.size === 0) {
      rooms.delete(roomId);
    } else {
      sendPresence(room);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`Realtime Sync Player running on port ${PORT}`);
});
