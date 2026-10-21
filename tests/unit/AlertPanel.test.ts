import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "../../src/components/AlertPanel";
import { store } from "../../src/core/DroneStore";

describe("<alert-panel> Web Component (Unit Tests / TDD)", () => {
  let element: HTMLElement;

  beforeEach(() => {
    store.clearAlerts();
    store.selectDrone(null);
    element = document.createElement("alert-panel");
    document.body.appendChild(element);
  });

  afterEach(() => {
    element.remove();
  });

  it("should toggle open class when 'visible' attribute is toggled", () => {
    const inner = element.querySelector("#alert-panel-inner");
    expect(inner?.classList.contains("open")).toBe(false);

    element.setAttribute("visible", "");
    expect(inner?.classList.contains("open")).toBe(true);

    element.removeAttribute("visible");
    expect(inner?.classList.contains("open")).toBe(false);
  });

  it("should show empty 'ALL SYSTEMS NOMINAL' state when there are no alerts", () => {
    const emptyState = element.querySelector(".alert-empty");
    expect(emptyState).toBeDefined();
    expect(emptyState?.textContent).toContain("ALL SYSTEMS NOMINAL");
  });

  it("should render alert items when alerts are added to the store", () => {
    store.addAlert({
      droneId: "DRONE-012",
      droneName: "DRONE-012",
      type: "signal_lost",
      message: "DRONE-012: signal lost",
    });

    const items = element.querySelectorAll(".alert-item");
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain("DRONE-012: signal lost");
    expect(items[0].classList.contains("alert-danger")).toBe(true);
  });

  it("should clear all alerts and show nominal state when 'CLEAR ALL ALERTS' is clicked", () => {
    store.addAlert({
      droneId: "DRONE-001",
      droneName: "DRONE-001",
      type: "battery_low",
      message: "Battery critical",
    });
    store.addAlert({
      droneId: "DRONE-002",
      droneName: "DRONE-002",
      type: "signal_lost",
      message: "Signal lost",
    });

    expect(element.querySelectorAll(".alert-item").length).toBe(2);

    const clearBtn = element.querySelector<HTMLButtonElement>("#ap-clear")!;
    clearBtn.click();

    expect(store.getAlerts().length).toBe(0);
    expect(element.querySelectorAll(".alert-item").length).toBe(0);
    expect(element.querySelector(".alert-empty")?.textContent).toContain("ALL SYSTEMS NOMINAL");
  });

  it("should dismiss an individual alert when its dismiss button (✕) is clicked", () => {
    store.addAlert({
      droneId: "DRONE-001",
      droneName: "DRONE-001",
      type: "battery_low",
      message: "Battery low",
    });
    store.addAlert({
      droneId: "DRONE-002",
      droneName: "DRONE-002",
      type: "signal_lost",
      message: "Signal lost",
    });

    const dismissBtns = element.querySelectorAll<HTMLButtonElement>(".alert-dismiss-btn");
    expect(dismissBtns.length).toBe(2);

    dismissBtns[0].click();

    expect(store.getAlerts().length).toBe(1);
    expect(element.querySelectorAll(".alert-item").length).toBe(1);
  });

  it("should select drone in store when alert body is clicked", () => {
    store.addAlert({
      droneId: "DRONE-009",
      droneName: "DRONE-009",
      type: "emergency",
      message: "Emergency return",
    });

    const alertItem = element.querySelector<HTMLElement>(".alert-item")!;
    alertItem.click();

    expect(store.selectedDroneId).toBe("DRONE-009");
  });
});
