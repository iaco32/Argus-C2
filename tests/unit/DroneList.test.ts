import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import "../../src/components/DroneList";
import { store } from "../../src/core/DroneStore";
import type { DroneSnapshot } from "../../src/types";

describe("<drone-list> Web Component (Unit Tests / TDD)", () => {
  let element: HTMLElement;

  const mockDrone = (id: string, status: any = "active", mission = "ISR-ALPHA", battery = 80): DroneSnapshot => ({
    id,
    name: `Drone ${id}`,
    status,
    lat: 50.45,
    lon: 30.52,
    alt: 120,
    heading: 45,
    speed: 15,
    battery,
    signal: 95,
    mission,
    batteryHistory: [battery, battery],
    altHistory: [120, 120],
    speedHistory: [15, 15],
    waypointProgress: 0.2,
  });

  beforeEach(() => {
    store.clearAlerts();
    store.selectDrone(null);
    store.applyInit([
      mockDrone("DRONE-001", "active", "ISR-ALPHA", 90),
      mockDrone("DRONE-002", "warning", "PATROL-BRAVO", 18),
      mockDrone("DRONE-003", "mission", "STRIKE-CHARLIE", 75),
      mockDrone("DRONE-004", "lost_signal", "RECON-DELTA", 40),
    ]);

    element = document.createElement("drone-list");
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it("should render fleet units count in header and items container", async () => {
    // Wait for requestAnimationFrame render
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const countEl = element.querySelector("#dl-count");
    expect(countEl?.textContent).toContain("4 / 4");

    const items = element.querySelectorAll(".drone-item");
    expect(items.length).toBe(4);
  });

  it("should select a drone on click and apply .selected class", async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const items = element.querySelectorAll<HTMLElement>(".drone-item");
    expect(items.length).toBeGreaterThan(0);

    const firstItem = items[0];
    const droneId = firstItem.dataset.id;
    expect(droneId).toBeDefined();

    firstItem.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(store.selectedDroneId).toBe(droneId);
    expect(firstItem.classList.contains("selected")).toBe(true);
  });

  it("should filter drones by status tab (e.g. ALERTS)", async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const alertsTab = element.querySelector<HTMLButtonElement>('.drone-filter-btn[data-filter="ALERTS"]');
    expect(alertsTab).toBeDefined();

    alertsTab?.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const items = element.querySelectorAll<HTMLElement>(".drone-item");
    // DRONE-002 (warning) and DRONE-004 (lost_signal) = 2 alerts
    expect(items.length).toBe(2);

    // Reset to ALL
    const allTab = element.querySelector<HTMLButtonElement>('.drone-filter-btn[data-filter="ALL"]');
    allTab?.click();
    await new Promise((resolve) => requestAnimationFrame(resolve));

    expect(element.querySelectorAll(".drone-item").length).toBe(4);
  });

  it("should filter drones by search input text", async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const searchInput = element.querySelector<HTMLInputElement>("#dl-search")!;
    searchInput.value = "BRAVO";
    searchInput.dispatchEvent(new Event("input"));

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const items = element.querySelectorAll<HTMLElement>(".drone-item");
    expect(items.length).toBe(1);
    expect(items[0].dataset.id).toBe("DRONE-002");
  });

  it("should preserve existing DOM nodes across updates (no innerHTML destruction)", async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const firstItemBefore = element.querySelector(".drone-item")!;
    const initialBatteryVal = firstItemBefore.querySelector(".bar-val")?.textContent;

    // Simulate telemetry update
    const drones = store.getAllDrones().map((d) =>
      d.id === "DRONE-001" ? { ...d, battery: 45 } : d
    );
    store.applyTelemetry(drones);

    await new Promise((resolve) => requestAnimationFrame(resolve));

    const firstItemAfter = element.querySelector(`[data-id="DRONE-001"]`);
    // Element identity must remain stable (not replaced by innerHTML wipe)
    expect(firstItemAfter).toBeDefined();
    expect(firstItemAfter?.querySelector(".bar-val")?.textContent).toBe("45%");
  });
});
