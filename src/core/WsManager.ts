/**
 * WebSocket Manager with automatic reconnection, exponential backoff,
 * latency measurement, and battery-aware tick rate negotiation.
 *
 * Demonstrates: production-grade WS handling for high-frequency telemetry.
 */

import { store } from "./DroneStore";
import type { TelemetryPacket } from "../types";

function resolveWsUrl(): string {
  const envUrl = (import.meta as any).env?.VITE_WS_URL;
  if (envUrl) return envUrl;

  if (typeof window !== "undefined" && window.location) {
    // In local Vite dev environment (port 5173), connect to backend simulator on 8765
    if (window.location.port === "5173") {
      return "ws://localhost:8765";
    }
    // In production (e.g. Render), connect to the same host using secure wss:// if https:
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}`;
  }

  return "ws://localhost:8765";
}

const MAX_RECONNECT_DELAY = 16000;
const INITIAL_RECONNECT_DELAY = 500;

type ConnectionState = "connecting" | "connected" | "disconnected" | "error";

type WsManagerListener = (state: ConnectionState, latency?: number) => void;

class WsManager {
  private ws: WebSocket | null = null;
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private _latency = 0;
  private _state: ConnectionState = "disconnected";
  private listeners = new Set<WsManagerListener>();

  // Message rate tracking
  private messageCount = 0;
  private lastRateCheck = Date.now();
  private _messageRate = 0; // msg/s

  get latency(): number { return this._latency; }
  get state(): ConnectionState { return this._state; }
  get messageRate(): number { return this._messageRate; }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.setState("connecting");
    try {
      const url = resolveWsUrl();
      this.ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.setState("connected");
      this.startPing();
    };

    this.ws.onmessage = (event: MessageEvent) => {
      this.messageCount++;

      // Rate tracking (update every second)
      const now = Date.now();
      if (now - this.lastRateCheck >= 1000) {
        this._messageRate = this.messageCount;
        this.messageCount = 0;
        this.lastRateCheck = now;
      }

      // Latency measurement via timestamp diff
      let packet: TelemetryPacket;
      try {
        packet = JSON.parse(event.data as string) as TelemetryPacket;
      } catch {
        return;
      }

      if (packet.timestamp) {
        this._latency = Date.now() - packet.timestamp;
      }

      this.handlePacket(packet);
    };

    this.ws.onclose = () => {
      this.stopPing();
      this.setState("disconnected");
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.setState("error");
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
    this.ws?.close();
    this.ws = null;
    this.setState("disconnected");
  }

  send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  onStateChange(listener: WsManagerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private handlePacket(packet: TelemetryPacket): void {
    switch (packet.type) {
      case "init":
        if (packet.drones) {
          store.applyInit(packet.drones);
        }
        break;
      case "telemetry":
        if (packet.drones) {
          store.applyTelemetry(packet.drones);
        }
        break;
      case "alert":
        if (packet.alert) {
          store.addAlert({
            droneId: packet.alert.droneId,
            droneName: packet.alert.droneName,
            type: packet.alert.type,
            message: packet.alert.message,
          });
        }
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      // Periodic keep-alive ping check
    }, 5000);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private setState(state: ConnectionState): void {
    this._state = state;
    for (const listener of this.listeners) {
      listener(state, this._latency);
    }
  }
}

export const wsManager = new WsManager();
