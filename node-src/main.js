"use strict";

const http = require("http");
const net = require("net");
const fs = require("fs");
const path = require("path");
const { EufySecurity } = require("eufy-security-client");

const CONTROL_PORT = 8787;
const STREAM_PORT = 8788;
const MAX_EVENTS = 350;
let client = null;
let clientCredentialKey = null;
let connectInFlight = null;
let liveDevice = null;
let streamSocket = null;
let seq = 0;
let eventSeq = 1;
let eventLog = [];
let stats = { eufyEvents: 0, aiEvents: 0 };
let listenersInstalled = false;
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

function safe(value, depth = 0) {
  if (depth > 4) return String(value);
  if (value === null || value === undefined) return value;
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}]`;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.slice(0, 60).map(v => safe(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (typeof v === "function") continue;
      try { out[k] = safe(v, depth + 1); } catch (_) {}
    }
    return out;
  }
  if (typeof value === "function") return undefined;
  return value;
}

function addEvent(source, type, label, device, details, data) {
  const e = {
    id: eventSeq++,
    ts: Date.now(),
    source: source || "eufy",
    type: type || "event",
    label: label || type || "Ereignis",
    device: device || "",
    details: details || "",
    data: safe(data)
  };
  eventLog.unshift(e);
  if (eventLog.length > MAX_EVENTS) eventLog.length = MAX_EVENTS;
  if (e.source === "local-ai") stats.aiEvents++; else stats.eufyEvents++;
  return e;
}

function deviceName(d) {
  try { return d.getName() || d.getModel() || "Kamera"; } catch (_) { return "Kamera"; }
}

function deviceSerial(d) {
  try { return d.getSerial(); } catch (_) { return ""; }
}

async function getDevice(sn) {
  if (!client) throw new Error("Nicht mit Eufy verbunden");
  if (typeof client.getDevice === "function") return client.getDevice(sn);
  const devices = await client.getDevices();
  const found = devices.find(d => deviceSerial(d) === sn);
  if (!found) throw new Error("Gerät nicht gefunden");
  return found;
}

async function getStation(sn) {
  if (!client) throw new Error("Nicht mit Eufy verbunden");
  if (typeof client.getStation === "function") return client.getStation(sn);
  const stations = await client.getStations();
  const found = stations.find(s => {
    try { return s.getSerial() === sn; } catch (_) { return false; }
  });
  if (!found) throw new Error("HomeBase/Station nicht gefunden");
  return found;
}

function extractHealth(d) {
  let battery = null;
  let wifi = null;
  let charging = null;
  try {
    const meta = d.getPropertiesMetadata(true) || {};
    for (const m of Object.values(meta)) {
      const n = String(m.name || "");
      let v;
      try { v = d.getPropertyValue(m.name); } catch (_) { continue; }
      if (battery === null && /battery/i.test(n) && typeof v === "number" && v >= 0 && v <= 100) battery = v;
      if (wifi === null && /(WifiSignalLevel|WifiRSSI)/i.test(n) && typeof v === "number") wifi = v;
      if (charging === null && /charging/i.test(n) && typeof v === "boolean") charging = v;
    }
  } catch (_) {}
  const bits = [];
  if (battery !== null) bits.push(`Akku ${battery}%`);
  if (charging === true) bits.push("lädt");
  if (wifi !== null) bits.push(`WLAN ${wifi}`);
  return bits.length ? bits.join(" · ") : "verbunden";
}

async function refreshDevices() {
  if (!client) return [];
  const devices = await client.getDevices();
  state.devices = devices.map(d => ({
    sn: deviceSerial(d),
    stationSn: (() => { try { return d.getStationSerial(); } catch (_) { return ""; } })(),
    name: deviceName(d),
    model: (() => { try { return d.getModel() || ""; } catch (_) { return ""; } })(),
    health: extractHealth(d)
  }));
  return state.devices;
}

function installEventListeners() {
  if (!client || listenersInstalled) return;
  listenersInstalled = true;

  const deviceEvents = [
    ["device motion detected", "motion", "Bewegung"],
    ["device person detected", "person", "Person"],
    ["device stranger person detected", "stranger", "Unbekannte Person"],
    ["device pet detected", "pet", "Tier"],
    ["device dog detected", "dog", "Hund"],
    ["device vehicle detected", "vehicle", "Fahrzeug"],
    ["device sound detected", "sound", "Geräusch"],
    ["device crying detected", "crying", "Weinen"],
    ["device rings", "ring", "Klingeln"],
    ["device package delivered", "package-delivered", "Paket geliefert"],
    ["device package stranded", "package-stranded", "Paket liegt noch"],
    ["device package taken", "package-taken", "Paket abgeholt"],
    ["device someone loitering", "loitering", "Aufenthalt erkannt"],
    ["device radar motion detected", "radar-motion", "Radar-Bewegung"],
    ["device low battery", "low-battery", "Akku niedrig"],
    ["device tampering", "tampering", "Manipulation erkannt"]
  ];

  for (const [eventName, type, label] of deviceEvents) {
    try {
      client.on(eventName, (device, active, extra) => {
        if (active === false) return;
        let details = "";
        if (typeof extra === "string" && extra.trim()) details = extra.trim();
        addEvent("eufy", type, label, deviceName(device), details, { sn: deviceSerial(device), extra: safe(extra) });
      });
    } catch (_) {}
  }

  try {
    client.on("device property changed", (device, name, value) => {
      if (/Battery|Wifi|Motion|Notification|Video|Audio|Microphone|Speaker/i.test(String(name))) {
        addEvent("eufy-state", "property", "Einstellung geändert", deviceName(device), `${name}: ${String(value)}`, { sn: deviceSerial(device) });
      }
    });
  } catch (_) {}

  try {
    client.on("station guard mode", (station, mode) => {
      let name = "HomeBase";
      try { name = station.getName() || station.getSerial(); } catch (_) {}
      addEvent("eufy", "guard-mode", "Sicherheitsmodus", name, `Modus ${mode}`, { mode });
    });
  } catch (_) {}

  try {
    client.on("push message", message => {
      addEvent("eufy-push", "push", "Eufy Push", "", "Push-Nachricht empfangen", safe(message));
    });
  } catch (_) {}
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
    listenersInstalled = false;
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
      trustedDeviceName: "Galaxy Tab S8 Plus - Eufy Smart Security",
      persistentDir,
      p2pConnectionSetup: 1,
      pollingIntervalMinutes: 5,
      eventDurationSeconds: 12,
      acceptInvitations: true,
      deviceConfig: { simultaneousDetections: true }
    });
    clientCredentialKey = key;
    installEventListeners();
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
      addEvent("system", "connected", "Eufy verbunden", "", "Smart Security Backend ist bereit");
    });
    client.on("connection error", err => {
      if (isTransientProfileError(err) && (state.phase === "connecting" || connectInFlight)) {
        state.phase = "connecting";
        state.message = "Eufy-Profil wird erneut geladen …";
        return;
      }
      state.phase = "error";
      state.message = messageOf(err) || "Verbindungsfehler";
      addEvent("system", "connection-error", "Verbindungsfehler", "", state.message);
    });
    client.on("station livestream start", (station, device, metadata, videoStream) => {
      liveDevice = device.getSerial();
      state.message = "Lokaler Livestream aktiv";
      addEvent("system", "live-start", "Livestream gestartet", deviceName(device), `${metadata.videoWidth}×${metadata.videoHeight}`);
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
    client.on("station livestream stop", (station, device) => {
      liveDevice = null;
      state.message = "Livestream gestoppt";
      addEvent("system", "live-stop", "Livestream gestoppt", device ? deviceName(device) : "", "");
      sendPacket(3, Buffer.from("stopped"));
    });
  }

  return connectWithRetry(verifyOptions || { force: false });
}

async function deviceProperties(sn) {
  const d = await getDevice(sn);
  const meta = typeof d.getPropertiesMetadata === "function" ? (d.getPropertiesMetadata(true) || {}) : {};
  const items = [];
  for (const m of Object.values(meta)) {
    if (!m || !m.name) continue;
    let value;
    try { value = d.getPropertyValue(m.name); } catch (_) { value = undefined; }
    items.push({
      name: m.name,
      label: m.label || "",
      description: m.description || "",
      type: m.type || typeof value,
      readable: m.readable !== false,
      writeable: m.writeable === true,
      value: safe(value),
      default: safe(m.default),
      min: m.min,
      max: m.max,
      steps: m.steps,
      states: safe(m.states),
      unit: m.unit || ""
    });
  }
  items.sort((a, b) => (Number(b.writeable) - Number(a.writeable)) || a.name.localeCompare(b.name));
  return { sn, name: deviceName(d), model: (() => { try { return d.getModel() || ""; } catch (_) { return ""; } })(), items };
}

async function stationProperties(sn) {
  const s = await getStation(sn);
  const meta = typeof s.getPropertiesMetadata === "function" ? (s.getPropertiesMetadata(true) || {}) : {};
  const items = [];
  for (const m of Object.values(meta)) {
    if (!m || !m.name) continue;
    let value;
    try { value = s.getPropertyValue(m.name); } catch (_) { value = undefined; }
    items.push({
      name: m.name,
      label: m.label || "",
      description: m.description || "",
      type: m.type || typeof value,
      readable: m.readable !== false,
      writeable: m.writeable === true,
      value: safe(value),
      default: safe(m.default),
      min: m.min,
      max: m.max,
      steps: m.steps,
      states: safe(m.states),
      unit: m.unit || ""
    });
  }
  return { sn, name: (() => { try { return s.getName() || sn; } catch (_) { return sn; } })(), items };
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
      return json(res, 200, { ok: true, version: "1.0-smart", node: process.version });
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

    if (req.method === "GET" && url.pathname === "/smart/overview") {
      if (state.phase === "connected") {
        try { await refreshDevices(); } catch (_) {}
      }
      let stations = [];
      if (client && state.phase === "connected" && typeof client.getStations === "function") {
        try {
          const list = await client.getStations();
          stations = list.map(s => ({
            sn: (() => { try { return s.getSerial(); } catch (_) { return ""; } })(),
            name: (() => { try { return s.getName() || s.getSerial(); } catch (_) { return "HomeBase"; } })()
          }));
        } catch (_) {}
      }
      return json(res, 200, {
        phase: state.phase,
        message: state.message,
        live: !!liveDevice,
        liveDevice,
        devices: state.devices,
        stations,
        stats,
        recent: eventLog.slice(0, 12)
      });
    }

    if (req.method === "GET" && url.pathname === "/events") {
      return json(res, 200, { events: eventLog.slice(0, 250), stats });
    }
    if (req.method === "POST" && url.pathname === "/events/clear") {
      eventLog = [];
      stats = { eufyEvents: 0, aiEvents: 0 };
      return json(res, 200, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/ai/event") {
      const b = await readJson(req);
      const kind = String(b.kind || "detected");
      const label = String(b.label || "AI Objekt");
      let details = `${Math.round(Number(b.score || 0) * 100)}% · Priorität ${Number(b.priority || 0)}`;
      if (kind === "loitering") details += ` · Aufenthalt ${Math.round(Number(b.visibleMs || 0) / 1000)}s`;
      const e = addEvent("local-ai", kind, label, "Tablet Smart Vision", details, b);
      return json(res, 200, { ok: true, event: e });
    }

    if (req.method === "GET" && url.pathname === "/device/properties") {
      const sn = String(url.searchParams.get("sn") || "");
      if (!sn) throw new Error("Geräte-Seriennummer fehlt");
      return json(res, 200, await deviceProperties(sn));
    }
    if (req.method === "POST" && url.pathname === "/device/property") {
      const b = await readJson(req);
      const sn = String(b.sn || "");
      const name = String(b.name || "");
      if (!client || state.phase !== "connected") throw new Error("Nicht mit Eufy verbunden");
      if (!sn || !name) throw new Error("Gerät oder Property fehlt");
      if (typeof client.setDeviceProperty !== "function") throw new Error("Gerätesteuerung wird von dieser Client-Version nicht unterstützt");
      await client.setDeviceProperty(sn, name, b.value);
      addEvent("local-control", "property-write", "Einstellung geändert", sn, `${name}: ${String(b.value)}`);
      await sleep(250);
      return json(res, 200, { ok: true, sn, name, value: b.value });
    }

    if (req.method === "GET" && url.pathname === "/station/properties") {
      const sn = String(url.searchParams.get("sn") || "");
      if (!sn) throw new Error("Station-Seriennummer fehlt");
      return json(res, 200, await stationProperties(sn));
    }
    if (req.method === "POST" && url.pathname === "/station/property") {
      const b = await readJson(req);
      if (!client || state.phase !== "connected") throw new Error("Nicht mit Eufy verbunden");
      if (typeof client.setStationProperty !== "function") throw new Error("Station-Steuerung wird von dieser Client-Version nicht unterstützt");
      await client.setStationProperty(String(b.sn || ""), String(b.name || ""), b.value);
      addEvent("local-control", "station-property", "HomeBase-Einstellung geändert", String(b.sn || ""), `${String(b.name || "")}: ${String(b.value)}`);
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/capabilities") {
      return json(res, 200, {
        livestream: !!client && typeof client.startStationLivestream === "function",
        deviceProperties: !!client && typeof client.setDeviceProperty === "function",
        stationProperties: !!client && typeof client.setStationProperty === "function",
        talkback: !!client && typeof client.startStationTalkback === "function",
        events: true,
        localAi: true,
        ultraDetail: true,
        renderRelay: false,
        version: "1.0-smart"
      });
    }

    return json(res, 404, { error: "Nicht gefunden" });
  } catch (e) {
    const msg = messageOf(e);
    state.message = msg;
    if (state.phase !== "tfa" && state.phase !== "captcha" && state.phase !== "connected") state.phase = "error";
    return json(res, 500, { error: msg, ...publicState() });
  }
}).listen(CONTROL_PORT, "127.0.0.1", () => {
  console.log("Eufy Smart Security bridge v1.0 ready on localhost");
});

process.on("uncaughtException", e => console.error("uncaught", e));
process.on("unhandledRejection", e => console.error("unhandled", e));
