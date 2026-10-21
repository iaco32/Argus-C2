import { describe, it, expect, beforeEach } from "vitest";
import { DroneStore } from "../../src/core/DroneStore";
import type { DroneSnapshot } from "../../src/types";

describe("DroneStore (Unit Tests / TDD)", () => {
  let store: DroneStore;

  const sampleDrone = (id: string, status: any = "active", battery = 80, signal = 90): DroneSnapshot => ({
    id,
    name: `Unit ${id}`,
    status,
    lat: 50.45,
    lon: 30.52,
    alt: 120,
    heading: 90,
    speed: 15,
    battery,
    signal,
    mission: "RECON-ALPHA",
    batteryHistory: [battery, battery],
    altHistory: [120, 120],
    speedHistory: [15, 15],
    waypointProgress: 0.5,
  });

  beforeEach(() => {
    store = new DroneStore();
  });

  describe("Initialization & Ingestion", () => {
    it("should initialize store with snapshots and mark them dirty", () => {
      const drones = [sampleDrone("DRONE-001"), sampleDrone("DRONE-002")];
      store.applyInit(drones);

      expect(store.getAllDrones().length).toBe(2);
      expect(store.getDrone("DRONE-001")).toBeDefined();
      expect(store.getDirtyIds().has("DRONE-001")).toBe(true);
      expect(store.getDirtyIds().has("DRONE-002")).toBe(true);
    });

    it("should ingest telemetry updates and track dirty IDs", () => {
      store.applyInit([sampleDrone("DRONE-001", "active", 100)]);
      store.clearDirty();
      expect(store.getDirtyIds().size).toBe(0);

      store.applyTelemetry([sampleDrone("DRONE-001", "warning", 18)]);
      expect(store.getDirtyIds().has("DRONE-001")).toBe(true);
      expect(store.getDrone("DRONE-001")?.battery).toBe(18);
      expect(store.getDrone("DRONE-001")?.status).toBe("warning");
    });
  });

  describe("Selection Management", () => {
    it("should select a drone and mark both previous and new IDs as dirty", () => {
      store.applyInit([sampleDrone("DRONE-001"), sampleDrone("DRONE-002")]);
      store.clearDirty();

      store.selectDrone("DRONE-001");
      expect(store.selectedDroneId).toBe("DRONE-001");
      expect(store.getSelectedDrone()?.id).toBe("DRONE-001");
      expect(store.getDirtyIds().has("DRONE-001")).toBe(true);

      store.clearDirty();
      store.selectDrone("DRONE-002");
      expect(store.selectedDroneId).toBe("DRONE-002");
      expect(store.getDirtyIds().has("DRONE-001")).toBe(true); // previous marked dirty to clear highlight
      expect(store.getDirtyIds().has("DRONE-002")).toBe(true); // new marked dirty to highlight
    });

    it("should allow deselecting a drone by passing null", () => {
      store.selectDrone("DRONE-001");
      expect(store.selectedDroneId).toBe("DRONE-001");

      store.selectDrone(null);
      expect(store.selectedDroneId).toBeNull();
      expect(store.getSelectedDrone()).toBeNull();
    });
  });

  describe("Deterministic Sorting", () => {
    it("should sort drones by priority (lost_signal > warning > mission > active) with stable ID tie-breaker", () => {
      const dActive2 = sampleDrone("DRONE-002", "active");
      const dActive1 = sampleDrone("DRONE-001", "active");
      const dWarn = sampleDrone("DRONE-003", "warning");
      const dLost = sampleDrone("DRONE-004", "lost_signal");

      store.applyInit([dActive2, dActive1, dWarn, dLost]);

      const sorted = store.getDronesSorted();
      expect(sorted[0].id).toBe("DRONE-004"); // lost_signal (priority 0)
      expect(sorted[1].id).toBe("DRONE-003"); // warning (priority 1)
      expect(sorted[2].id).toBe("DRONE-001"); // active sorted by ID (DRONE-001 before DRONE-002)
      expect(sorted[3].id).toBe("DRONE-002");
    });
  });

  describe("Fleet Statistics Aggregation", () => {
    it("should compute accurate fleet counts and averages", () => {
      store.applyInit([
        sampleDrone("DRONE-001", "active", 80, 100),
        sampleDrone("DRONE-002", "mission", 60, 80),
        sampleDrone("DRONE-003", "warning", 20, 60),
        sampleDrone("DRONE-004", "lost_signal", 40, 0),
      ]);

      const stats = store.getFleetStats();
      expect(stats.total).toBe(4);
      expect(stats.active).toBe(1);
      expect(stats.mission).toBe(1);
      expect(stats.warning).toBe(1);
      expect(stats.lost).toBe(1);
      expect(stats.avgBattery).toBe(50); // (80 + 60 + 20 + 40) / 4
      expect(stats.avgSignal).toBe(60);  // (100 + 80 + 60 + 0) / 4
    });

    it("should handle empty fleet stats safely", () => {
      const stats = store.getFleetStats();
      expect(stats.total).toBe(0);
      expect(stats.avgBattery).toBe(0);
      expect(stats.avgSignal).toBe(0);
    });
  });

  describe("Alerts Management", () => {
    it("should add alerts and track unread count", () => {
      store.addAlert({
        droneId: "DRONE-001",
        droneName: "Unit DRONE-001",
        type: "battery_low",
        message: "Battery critical at 15%",
      });

      expect(store.getAlerts().length).toBe(1);
      expect(store.getUnreadAlertCount()).toBe(1);
      expect(store.getAlerts()[0].message).toBe("Battery critical at 15%");
    });

    it("should mark alerts as read", () => {
      store.addAlert({
        droneId: "DRONE-001",
        droneName: "Unit DRONE-001",
        type: "battery_low",
        message: "Battery low",
      });

      expect(store.getUnreadAlertCount()).toBe(1);
      store.markAlertsRead();
      expect(store.getUnreadAlertCount()).toBe(0);
      expect(store.getAlerts().length).toBe(1);
    });

    it("should clear all alerts on clearAlerts()", () => {
      store.addAlert({ droneId: "D1", droneName: "Unit 1", type: "battery_low", message: "Alert 1" });
      store.addAlert({ droneId: "D2", droneName: "Unit 2", type: "signal_lost", message: "Alert 2" });

      expect(store.getAlerts().length).toBe(2);
      store.clearAlerts();

      expect(store.getAlerts().length).toBe(0);
      expect(store.getUnreadAlertCount()).toBe(0);
    });

    it("should dismiss an individual alert by ID", () => {
      store.addAlert({ droneId: "D1", droneName: "Unit 1", type: "battery_low", message: "Alert 1" });
      store.addAlert({ droneId: "D2", droneName: "Unit 2", type: "signal_lost", message: "Alert 2" });

      const alertToDismiss = store.getAlerts()[0].id;
      store.dismissAlert(alertToDismiss);

      expect(store.getAlerts().length).toBe(1);
      expect(store.getAlerts().some((a) => a.id === alertToDismiss)).toBe(false);
    });
  });

  describe("Events & Subscriptions", () => {
    it("should notify listeners on store events and allow unsubscribing", () => {
      let eventCount = 0;
      let lastEvent = "";

      const unsubscribe = store.on((event) => {
        eventCount++;
        lastEvent = event;
      });

      store.applyInit([]);
      expect(eventCount).toBe(1);
      expect(lastEvent).toBe("init");

      store.selectDrone("D1");
      expect(eventCount).toBe(2);
      expect(lastEvent).toBe("update");

      unsubscribe();
      store.selectDrone(null);
      expect(eventCount).toBe(2); // no further calls after unsubscribe
    });
  });
});
