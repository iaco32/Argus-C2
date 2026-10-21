/**
 * ARGUS C2 - Telemetry Simulation Server
 * Generates realistic drone telemetry at high frequency via WebSocket.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8765;
const DIST_DIR = path.resolve(process.cwd(), "dist");

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export type DroneStatus =
  | "active"
  | "warning"
  | "lost_signal"
  | "returning"
  | "idle"
  | "mission";

export interface Waypoint {
  lat: number;
  lon: number;
  alt: number;
}

export interface DroneState {
  id: string;
  name: string;
  status: DroneStatus;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speed: number;
  battery: number;
  signal: number;
  mission: string;
  waypoints: Waypoint[];
  currentWaypointIndex: number;
  lastUpdate: number;
  batteryHistory: number[];
  altHistory: number[];
  speedHistory: number[];
}

export interface DroneSnapshot {
  id: string;
  name: string;
  status: DroneStatus;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speed: number;
  battery: number;
  signal: number;
  mission: string;
  batteryHistory: number[];
  altHistory: number[];
  speedHistory: number[];
  waypointProgress: number;
}

export interface AlertPayload {
  droneId: string;
  droneName: string;
  type: "battery_low" | "signal_lost" | "waypoint_reached" | "emergency";
  message: string;
}

export interface TelemetryPacket {
  type: "init" | "telemetry" | "alert" | "config";
  timestamp: number;
  drones?: DroneSnapshot[];
  alert?: AlertPayload;
  droneCount?: number;
}

// ─── Simulation Constants ─────────────────────────────────────────────────────

// Poligono Interforze Salto di Quirra (PISQ) / Tyrrhenian Range, Sardinia, Italy
const BASE_LAT = 39.5500;
const BASE_LON = 9.6000;
const SPREAD_LAT = 0.25;
const SPREAD_LON = 0.35;

const MISSIONS = [
  "ISR-ALPHA", "PATROL-BRAVO", "STRIKE-CHARLIE",
  "RECON-DELTA", "ESCORT-ECHO", "PERIMETER-FOXTROT",
];

const STATUS_TRANSITIONS: Record<DroneStatus, DroneStatus[]> = {
  active: ["active", "active", "active", "mission", "warning"],
  mission: ["mission", "mission", "active", "returning"],
  returning: ["returning", "returning", "idle"],
  idle: ["idle", "active"],
  warning: ["warning", "active", "lost_signal"],
  lost_signal: ["lost_signal", "warning", "active"],
};

// ─── Drone Factory ────────────────────────────────────────────────────────────

function createDrone(index: number): DroneState {
  const id = `DRONE-${String(index + 1).padStart(3, "0")}`;
  const lat = BASE_LAT + (Math.random() - 0.5) * SPREAD_LAT;
  const lon = BASE_LON + (Math.random() - 0.5) * SPREAD_LON;
  const battery = 40 + Math.random() * 60;

  const waypoints: Waypoint[] = Array.from({ length: 4 }, () => ({
    lat: BASE_LAT + (Math.random() - 0.5) * SPREAD_LAT,
    lon: BASE_LON + (Math.random() - 0.5) * SPREAD_LON,
    alt: 80 + Math.random() * 120,
  }));

  return {
    id, name: id,
    status: Math.random() > 0.2 ? "active" : "mission",
    lat, lon,
    alt: 50 + Math.random() * 150,
    heading: Math.random() * 360,
    speed: 5 + Math.random() * 20,
    battery,
    signal: 60 + Math.random() * 40,
    mission: MISSIONS[index % MISSIONS.length],
    waypoints,
    currentWaypointIndex: 0,
    lastUpdate: Date.now(),
    batteryHistory: Array.from({ length: 60 }, (_, i) =>
      Math.min(100, battery + (60 - i) * 0.1 + (Math.random() - 0.5) * 2)
    ),
    altHistory: Array.from({ length: 60 }, () => 50 + Math.random() * 150),
    speedHistory: Array.from({ length: 60 }, () => 5 + Math.random() * 20),
  };
}

// ─── Physics Update ───────────────────────────────────────────────────────────

const DEG_PER_METER_LAT = 1 / 111320;
const DEG_PER_METER_LON = (lat: number) => 1 / (111320 * Math.cos((lat * Math.PI) / 180));

function updateDrone(drone: DroneState, dt: number): AlertPayload | null {
  let alert: AlertPayload | null = null;
  const target = drone.waypoints[drone.currentWaypointIndex];
  const dLat = target.lat - drone.lat;
  const dLon = target.lon - drone.lon;
  const dist = Math.sqrt(dLat * dLat + dLon * dLon);

  if (dist < 0.001) {
    const prevIdx = drone.currentWaypointIndex;
    drone.currentWaypointIndex = (drone.currentWaypointIndex + 1) % drone.waypoints.length;
    if (prevIdx === drone.waypoints.length - 1) {
      alert = { droneId: drone.id, droneName: drone.name, type: "waypoint_reached", message: `${drone.name} completed mission circuit` };
    }
  } else {
    const targetHeading = (Math.atan2(dLon, dLat) * 180) / Math.PI;
    const headingDiff = ((targetHeading - drone.heading + 540) % 360) - 180;
    drone.heading = (drone.heading + Math.sign(headingDiff) * Math.min(Math.abs(headingDiff), 5) + 360) % 360;
    const moveSpeed = drone.speed * dt;
    drone.lat += (dLat / dist) * moveSpeed * DEG_PER_METER_LAT;
    drone.lon += (dLon / dist) * moveSpeed * DEG_PER_METER_LON(drone.lat);
  }

  drone.alt += (target.alt - drone.alt) * 0.05 + (Math.random() - 0.5) * 2;
  drone.alt = Math.max(20, Math.min(300, drone.alt));
  drone.speed = Math.max(3, Math.min(35, drone.speed + (Math.random() - 0.5) * 1.5));

  const drainRate = (0.016 * dt) / 60;
  const prevBattery = drone.battery;
  drone.battery = Math.max(0, drone.battery - drainRate);
  drone.signal = Math.max(0, Math.min(100, drone.signal + (Math.random() - 0.5) * 3));

  if (prevBattery > 20 && drone.battery <= 20 && drone.status !== "lost_signal") {
    alert = { droneId: drone.id, droneName: drone.name, type: "battery_low", message: `${drone.name}: battery critical at ${drone.battery.toFixed(0)}%` };
    drone.status = "warning";
  }

  if (drone.signal < 15 && drone.status === "active") {
    drone.status = "lost_signal";
    alert = { droneId: drone.id, droneName: drone.name, type: "signal_lost", message: `${drone.name}: signal lost` };
  } else if (drone.signal > 25 && drone.status === "lost_signal") {
    drone.status = "active";
  }

  if (Math.random() < 0.001) {
    const transitions = STATUS_TRANSITIONS[drone.status];
    drone.status = transitions[Math.floor(Math.random() * transitions.length)];
  }

  drone.batteryHistory.push(drone.battery); drone.batteryHistory.shift();
  drone.altHistory.push(drone.alt); drone.altHistory.shift();
  drone.speedHistory.push(drone.speed); drone.speedHistory.shift();
  drone.lastUpdate = Date.now();
  return alert;
}

function toSnapshot(drone: DroneState): DroneSnapshot {
  return {
    id: drone.id, name: drone.name, status: drone.status,
    lat: drone.lat, lon: drone.lon, alt: drone.alt,
    heading: drone.heading, speed: drone.speed,
    battery: drone.battery, signal: drone.signal,
    mission: drone.mission,
    batteryHistory: drone.batteryHistory,
    altHistory: drone.altHistory,
    speedHistory: drone.speedHistory,
    waypointProgress: drone.currentWaypointIndex / drone.waypoints.length,
  };
}

// ─── Server ───────────────────────────────────────────────────────────────────

const server = http.createServer((req, res) => {
  // Health check endpoint for cloud load balancers / Render
  if (req.url === "/healthz" || req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("OK");
    return;
  }

  // If dist doesn't exist yet (e.g. running in pure dev without build)
  if (!fs.existsSync(DIST_DIR)) {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ARGUS C2 Simulation Server (run 'npm run build' to serve frontend)");
    return;
  }

  const safeUrl = (req.url || "/").split("?")[0];
  let filePath = path.join(DIST_DIR, safeUrl);

  // Security: prevent directory traversal
  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, "index.html");
  }

  // Fallback to index.html for SPA client-side routing
  if (!fs.existsSync(filePath)) {
    filePath = path.join(DIST_DIR, "index.html");
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500);
      res.end("Internal Server Error");
      return;
    }
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server });
let drones: DroneState[] = [];
let droneCount = 50;
let tickRateHz = 10;
let tickInterval: ReturnType<typeof setInterval> | null = null;

function initDrones(count: number) {
  drones = Array.from({ length: count }, (_, i) => createDrone(i));
  droneCount = count;
}

function startSimulation() {
  if (tickInterval) clearInterval(tickInterval);
  const dt = 1 / tickRateHz;

  tickInterval = setInterval(() => {
    const now = Date.now();
    const alerts: AlertPayload[] = [];

    for (const drone of drones) {
      const alert = updateDrone(drone, dt);
      if (alert) alerts.push(alert);
    }

    const packet: TelemetryPacket = {
      type: "telemetry",
      timestamp: now,
      drones: drones.map(toSnapshot),
    };

    const payload = JSON.stringify(packet);

    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        if ((client as any).bufferedAmount > 65536) {
          return; // backpressure: skip frame
        }
        client.send(payload);
      }
    });

    if (alerts.length > 0) {
      const alertPayload = JSON.stringify({ type: "alert", timestamp: now, alert: alerts[0] } as TelemetryPacket);
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(alertPayload);
      });
    }
  }, 1000 / tickRateHz);
}

initDrones(droneCount);
startSimulation();

wss.on("connection", (ws) => {
  console.log(`[WS] Client connected (${wss.clients.size} total)`);

  ws.send(JSON.stringify({ type: "init", timestamp: Date.now(), drones: drones.map(toSnapshot), droneCount } as TelemetryPacket));

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === "set_drone_count") {
        const newCount = Math.max(1, Math.min(500, msg.count));
        initDrones(newCount);
        console.log(`[SIM] Drone count set to ${newCount}`);
        const payload = JSON.stringify({ type: "init", timestamp: Date.now(), drones: drones.map(toSnapshot), droneCount: newCount } as TelemetryPacket);
        wss.clients.forEach((client) => { if (client.readyState === WebSocket.OPEN) client.send(payload); });
      }
      if (msg.type === "set_tick_rate") {
        tickRateHz = Math.max(1, Math.min(30, msg.hz));
        startSimulation();
        console.log(`[SIM] Tick rate set to ${tickRateHz}Hz`);
      }
    } catch (e) {
      console.error("[WS] Invalid message:", e);
    }
  });

  ws.on("close", () => console.log(`[WS] Client disconnected (${wss.clients.size} remaining)`));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ARGUS C2 Server running on port ${PORT}`);
  console.log(`   Web UI: http://localhost:${PORT} (serving ${fs.existsSync(DIST_DIR) ? "dist/" : "dev mode"})`);
  console.log(`   WebSocket: ws://localhost:${PORT}`);
  console.log(`   Simulating ${droneCount} drones @ ${tickRateHz}Hz`);
});
