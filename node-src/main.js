"use strict";

const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { EufySecurity } = require("eufy-security-client");

const CONTROL_PORT = 8787;
const STREAM_PORT = 8788;
let client = null;
let clientCredentialKey = null;
let connectInFlight = null;
let liveDevice = null;
let streamSocket = null;
let seq = 0;
let state = {
  phase: "idle",
  message: "Bereit",
  devices: [],
  captchaId: null,
  captcha: null
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": body.length,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", c => {
      size += c.length;
      if (size > 1024 * 1024) {
        reject(new Error("Request zu groß"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
      } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function publicState() {
  return {
    phase: state.phase,
    message: state.message,
    devices: state.devices,
    captchaId: state.captchaId,
    captcha: state.captcha
  };
}

function messageOf(err) {
  return String(err && err.message ? err.message : err || "");
}

function isTransientProfileError(err) {
  const m = messageOf(err).toLowerCase();
  return m.includes("passport profile") ||
    m.includes("get passport") ||
    m.includes("api get passport") ||
    m.includes("profile error") ||
    m.includes("network error") ||
    m.includes("socket hang up") ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("timeout");
}

async function refreshDevices() {
  if (!client) return [];
  const devices = await client.getDevices();
  state.devices = devices.map(d => ({
    sn: d.getSerial(),
    stationSn: d.getStationSerial(),
    name: d.getName() || d.getModel() || "Kamera",
    model: d.getModel() || ""
  }));
  return state.devices;
}

async function waitForSettledState(timeoutMs) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (state.phase === "connected" || state.phase === "tfa" || state.phase === "captcha") return;
    await sleep(150);
  }
}

async function connectWithRetry(options) {
  if (!client) throw new Error("Eufy-Client nicht initialisiert");
  if (state.phase === "connected") {
    try { await refreshDevices(); } catch (_) {}
    return publicState();
  }
  if (connectInFlight) return connectInFlight;

  connectInFlight = (async () => {
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      state.phase = "connecting";
      state.message = attempt === 0 ? "Eufy wird angemeldet …" : "Eufy-Profil wird automatisch erneut geladen …";
      try {
        await client.connect(options || { force: false });
        await waitForSettledState(1800);
        if (state.phase === "connected") {
          try { await refreshDevices(); } catch (_) {}
          return publicState();
        }
        if (state.phase === "tfa" || state.phase === "captcha") return publicState();
      } catch (e) {
        lastError = e;
        if (state.phase === "connected") {
          try { await refreshDevices(); } catch (_) {}
          return publicState();
        }
        if (state.phase === "tfa" || state.phase === "captcha") return publicState();
        if (!isTransientProfileError(e) || attempt === 2) throw e;
        state.phase = "connecting";
        state.message = "Eufy-Profil antwortet verzögert – neuer Versuch läuft …";
        await sleep(700 + attempt * 650);
        if (state.phase === "connected") {
          try { await refreshDevices(); } catch (_) {}
          return publicState();
        }
      }
    }
    if (lastError) throw lastError;
    return publicState();
  })();

  try {
    return await connectInFlight;
  } finally {
    connectInFlight = null;
  }
}

async function createClient(email, password, verifyOptions) {
  if (!email || !password) throw new Error("E-Mail und Passwort fehlen");
  const key = email + "\u0000" + password;

  if (client && clientCredentialKey !== key) {
    try { if (liveDevice) await client.stopStationLivestream(liveDevice); } catch (_) {}
    try { await client.close(); } catch (_) {}
    client = null;
    clientCredentialKey = null;
    liveDevice = null;
    state.devices = [];
    state.phase = "idle";
  }

  if (!client) {
    const persistentDir = path.join(__dirname, "state");
    fs.mkdirSync(persistentDir, { recursive: true });
    state.phase = "connecting";
    state.message = "Eufy wird verbunden …";
    client = await EufySecurity.initialize({
      username: email,
      password,
      country: "DE",
      language: "de",
      trustedDeviceName: "Galaxy Tab S8 Plus - Eufy Monitor",
      persistentDir,
      p2pConnectionSetup: 1,
      pollingIntervalMinutes: 10,
      eventDurationSeconds: 10,
      acceptInvitations: true
    });
    clientCredentialKey = key;

    client.setCameraMaxLivestreamDuration(0);

    client.on("tfa request", () => {
      state.phase = "tfa";
      state.message = "Eufy-Bestätigungscode erforderlich";
    });
    client.on("captcha request", (id, captcha) => {
      state.phase = "captcha";
      state.message = "Eufy-Captcha erforderlich";
      state.captchaId = id;
      state.captcha = captcha;
    });
    client.on("connect", async () => {
      state.phase = "connected";
      state.message = "Verbunden";
      state.captchaId = null;
      state.captcha = null;
      try {
        await refreshDevices();
      } catch (_) {
        state.message = "Verbunden, Geräteliste wird geladen";
      }
    });
    client.on("connection error", err => {
      if (isTransientProfileError(err) && (state.phase === "connecting" || connectInFlight)) {
        state.phase = "connecting";
        state.message = "Eufy-Profil wird erneut geladen …";
        return;
      }
      state.phase = "error";
      state.message = messageOf(err) || "Verbindungsfehler";
    });
    client.on("station livestream start", (station, device, metadata, videoStream) => {
      liveDevice = device.getSerial();
      state.message = "Lokaler Livestream aktiv";
      sendPacket(1, Buffer.from(JSON.stringify({
        codec: metadata.videoCodec,
        fps: metadata.videoFPS,
        width: metadata.videoWidth,
        height: metadata.videoHeight,
        audioCodec: metadata.audioCodec,
        sn: liveDevice
      })));
      videoStream.on("data", chunk => sendPacket(2, chunk));
      videoStream.on("error", err => sendPacket(3, Buffer.from(messageOf(err))));
    });
    client.on("station livestream stop", () => {
      liveDevice = null;
      state.message = "Livestream gestoppt";
      sendPacket(3, Buffer.from("stopped"));
    });
  }

  return connectWithRetry(verifyOptions || { force: false });
}

function sendPacket(type, payload) {
  if (!streamSocket || streamSocket.destroyed) return;
  try {
    const header = Buffer.alloc(16);
    header.write("EUFY", 0, 4, "ascii");
    header.writeUInt8(type, 4);
    header.writeUInt32BE(payload.length, 8);
    header.writeUInt32BE((seq++ >>> 0), 12);
    streamSocket.write(header);
    streamSocket.write(payload);
  } catch (_) {}
}

net.createServer(socket => {
  if (streamSocket && !streamSocket.destroyed) streamSocket.destroy();
  streamSocket = socket;
  socket.setNoDelay(true);
  socket.setKeepAlive(true, 5000);
  socket.on("close", () => { if (streamSocket === socket) streamSocket = null; });
  socket.on("error", () => {});
}).listen(STREAM_PORT, "127.0.0.1");

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true, version: "0.4", node: process.version });
    }
    if (req.method === "GET" && url.pathname === "/state") {
      if (state.phase === "connected") {
        try { await refreshDevices(); } catch (_) {}
      }
      return json(res, 200, publicState());
    }
    if (req.method === "POST" && url.pathname === "/login") {
      const b = await readJson(req);
      const result = await createClient(String(b.email || ""), String(b.password || ""));
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/challenge") {
      const b = await readJson(req);
      if (!client) throw new Error("Noch keine Eufy-Anmeldung gestartet");
      if (state.phase === "tfa") {
        await connectWithRetry({ force: true, verifyCode: String(b.code || "") });
      } else if (state.phase === "captcha") {
        await connectWithRetry({ force: true, captcha: { captchaId: state.captchaId, captchaCode: String(b.code || "") } });
      }
      if (state.phase === "connected") await refreshDevices();
      return json(res, 200, publicState());
    }
    if (req.method === "POST" && url.pathname === "/live/start") {
      const b = await readJson(req);
      if (!client || state.phase !== "connected") throw new Error("Nicht mit Eufy verbunden");
      const sn = String(b.sn || "");
      if (!sn) throw new Error("Keine Kamera ausgewählt");
      if (liveDevice && liveDevice !== sn) {
        try { await client.stopStationLivestream(liveDevice); } catch (_) {}
      }
      await client.startStationLivestream(sn);
      return json(res, 200, { ok: true, sn });
    }
    if (req.method === "POST" && url.pathname === "/live/stop") {
      if (client && liveDevice) {
        const sn = liveDevice;
        try { await client.stopStationLivestream(sn); } finally { liveDevice = null; }
      }
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: "Nicht gefunden" });
  } catch (e) {
    const msg = messageOf(e);
    state.message = msg;
    if (state.phase !== "tfa" && state.phase !== "captcha" && state.phase !== "connected") state.phase = "error";
    return json(res, 500, { error: msg, ...publicState() });
  }
}).listen(CONTROL_PORT, "127.0.0.1", () => {
  console.log("Eufy Monitor bridge v0.4 ready on localhost");
});

process.on("uncaughtException", e => console.error("uncaught", e));
process.on("unhandledRejection", e => console.error("unhandled", e));
