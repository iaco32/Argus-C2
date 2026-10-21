/**
 * DroneStore - Central state management for drone telemetry.
 * Uses Map for O(1) lookups, circular buffers for history,
 * and event-based updates to decouple rendering from data ingestion.
 *
 * Key optimizations:
 * - Dirty tracking: only update DOM/canvas for changed drones
 * - Throttled listeners: callers control their own render rate
 * - Memory-bounded history with typed arrays for GC efficiency
 */

import type { DroneSnapshot, DroneStatus } from "../types";

export type StoreEvent = "update" | "alert" | "init";

export interface StoreAlert {
  id: string;
  droneId: string;
  droneName: string;
  type: string;
  message: string;
  timestamp: number;
  read: boolean;
}

export interface FleetStats {
  total: number;
  active: number;
  mission: number;
  warning: number;
  lost: number;
  idle: number;
  returning: number;
  avgBattery: number;
  avgSignal: number;
}

type Listener = (event: StoreEvent) => void;

export class DroneStore {
  private drones = new Map<string, DroneSnapshot>();
  private dirtyIds = new Set<string>();
  private listeners = new Set<Listener>();
  private alerts: StoreAlert[] = [];
  private alertIdCounter = 0;
  private _selectedDroneId: string | null = null;

  // ── Public API ──────────────────────────────────────────────────────────────

  get selectedDroneId(): string | null {
    return this._selectedDroneId;
  }

  selectDrone(id: string | null): void {
    const prev = this._selectedDroneId;
    this._selectedDroneId = id;
    // Mark both old and new as dirty so the map can redraw their visual state
    if (prev) this.dirtyIds.add(prev);
    if (id) this.dirtyIds.add(id);
    this.emit("update");
  }

  getSelectedDrone(): DroneSnapshot | null {
    return this._selectedDroneId ? (this.drones.get(this._selectedDroneId) ?? null) : null;
  }

  getDrone(id: string): DroneSnapshot | undefined {
    return this.drones.get(id);
  }

  getAllDrones(): DroneSnapshot[] {
    return Array.from(this.drones.values());
  }

  getDronesSorted(): DroneSnapshot[] {
    return this.getAllDrones().sort((a, b) => {
      // Priority: warning/lost > active/mission > others
      const priority = (s: DroneStatus) => {
        if (s === "lost_signal") return 0;
        if (s === "warning") return 1;
        if (s === "mission") return 2;
        if (s === "active") return 3;
        if (s === "returning") return 4;
        return 5;
      };
      const diff = priority(a.status) - priority(b.status);
      if (diff !== 0) return diff;
      return a.id.localeCompare(b.id, undefined, { numeric: true });
    });
  }

  getDirtyIds(): ReadonlySet<string> {
    return this.dirtyIds;
  }

  clearDirty(): void {
    this.dirtyIds.clear();
  }

  getFleetStats(): FleetStats {
    const drones = this.getAllDrones();
    const stats: FleetStats = {
      total: drones.length,
      active: 0, mission: 0, warning: 0,
      lost: 0, idle: 0, returning: 0,
      avgBattery: 0, avgSignal: 0,
    };

    for (const d of drones) {
      stats[d.status === "lost_signal" ? "lost" : d.status as keyof FleetStats]++;
      stats.avgBattery += d.battery;
      stats.avgSignal += d.signal;
    }

    if (drones.length > 0) {
      stats.avgBattery /= drones.length;
      stats.avgSignal /= drones.length;
    }

    return stats;
  }

  // ── Data Ingestion ──────────────────────────────────────────────────────────

  applyInit(snapshots: DroneSnapshot[]): void {
    this.drones.clear();
    this.dirtyIds.clear();
    for (const snap of snapshots) {
      this.drones.set(snap.id, snap);
      this.dirtyIds.add(snap.id);
    }
    this.emit("init");
  }

  applyTelemetry(snapshots: DroneSnapshot[]): void {
    for (const snap of snapshots) {
      this.drones.set(snap.id, snap);
      this.dirtyIds.add(snap.id);
    }
    this.emit("update");
  }

  addAlert(alert: Omit<StoreAlert, "id" | "timestamp" | "read">): void {
    const storeAlert: StoreAlert = {
      ...alert,
      id: String(++this.alertIdCounter),
      timestamp: Date.now(),
      read: false,
    };
    this.alerts.unshift(storeAlert);
    // Cap alerts at 50
    if (this.alerts.length > 50) this.alerts.length = 50;
    this.emit("alert");
  }

  getAlerts(): readonly StoreAlert[] {
    return this.alerts;
  }

  getUnreadAlertCount(): number {
    return this.alerts.filter((a) => !a.read).length;
  }

  markAlertsRead(): void {
    for (const alert of this.alerts) alert.read = true;
    this.emit("alert");
  }

  clearAlerts(): void {
    this.alerts = [];
    this.emit("alert");
  }

  dismissAlert(id: string): void {
    this.alerts = this.alerts.filter((a) => a.id !== id);
    this.emit("alert");
  }

  // ── Events ──────────────────────────────────────────────────────────────────

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }
}

export const store = new DroneStore();
