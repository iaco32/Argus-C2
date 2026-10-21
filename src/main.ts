/**
 * ARGUS C2 - Main Entry Point
 * Bootstraps: Web Components, WS connection, render scheduler
 */

// ── Web Components (register them) ───────────────────────────────────────────
import "./components/MapView";
import "./components/DroneList";
import "./components/TelemetryPanel";
import "./components/StatusBar";
import "./components/AlertPanel";
import "./components/FleetStats";

// ── Core ─────────────────────────────────────────────────────────────────────
import { wsManager } from "./core/WsManager";
import { scheduler } from "./core/Scheduler";

// ── CSS ───────────────────────────────────────────────────────────────────────
import "./style.css";

// ── Bootstrap ─────────────────────────────────────────────────────────────────
async function bootstrap() {
  await scheduler.init(); // Battery API setup
  wsManager.connect();    // Connect to telemetry server
}

bootstrap().catch(console.error);
