/**
 * <alert-panel> Web Component
 * Real-time alert feed with categorized alerts, interactive drone selection,
 * individual dismissal, and complete clearing.
 */

import { store } from "../core/DroneStore";
import type { StoreAlert } from "../core/DroneStore";

export class AlertPanelElement extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private listEl!: HTMLElement;
  private titleCountEl!: HTMLElement;
  private visible = false;
  private timeRefreshTimer: ReturnType<typeof setInterval> | null = null;

  static get observedAttributes() {
    return ["visible"];
  }

  connectedCallback(): void {
    this.innerHTML = /* html */ `
      <div class="alert-panel" id="alert-panel-inner">
        <div class="alert-panel__header">
          <div class="alert-panel__title-wrap">
            <span>SYSTEM ALERTS</span>
            <span class="alert-panel__badge" id="ap-badge">0</span>
          </div>
          <button class="alert-panel__close" id="ap-close" title="Close alert panel">✕</button>
        </div>
        <div class="alert-panel__list" id="ap-list"></div>
        <div class="alert-panel__footer">
          <button class="alert-clear-btn" id="ap-clear">CLEAR ALL ALERTS</button>
        </div>
      </div>
    `;

    this.listEl = this.querySelector("#ap-list") as HTMLElement;
    this.titleCountEl = this.querySelector("#ap-badge") as HTMLElement;

    const closeBtn = this.querySelector("#ap-close") as HTMLButtonElement;
    closeBtn.addEventListener("click", () => this.removeAttribute("visible"));

    const clearBtn = this.querySelector("#ap-clear") as HTMLButtonElement;
    clearBtn.addEventListener("click", () => {
      store.clearAlerts();
    });

    // Click handling on alerts:
    // - Dismiss button (✕) dismisses single alert
    // - Alert body click selects the drone and centers map
    this.listEl.addEventListener("click", (e) => {
      const target = e.target as HTMLElement;
      const dismissBtn = target.closest<HTMLElement>(".alert-dismiss-btn");
      if (dismissBtn) {
        e.stopPropagation();
        const alertId = dismissBtn.dataset.id;
        if (alertId) store.dismissAlert(alertId);
        return;
      }

      const item = target.closest<HTMLElement>(".alert-item");
      if (item && item.dataset.droneId) {
        const droneId = item.dataset.droneId;
        store.selectDrone(droneId);
        const drone = store.getDrone(droneId);
        if (drone) {
          const mapView = document.querySelector("map-view") as any;
          mapView?.flyTo(drone.lat, drone.lon);
        }
      }
    });

    // Re-render when alert list changes
    this.unsubscribe = store.on((event) => {
      if (event === "alert" || event === "init") {
        this.renderAlerts();
      }
    });

    // Periodic refresh of timestamps every 10s
    this.timeRefreshTimer = setInterval(() => {
      if (this.visible && store.getAlerts().length > 0) {
        this.renderAlerts();
      }
    }, 10000);

    this.renderAlerts();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    if (this.timeRefreshTimer) clearInterval(this.timeRefreshTimer);
  }

  attributeChangedCallback(name: string, _old: string, _new: string): void {
    if (name === "visible") {
      this.visible = this.hasAttribute("visible");
      const inner = this.querySelector("#alert-panel-inner") as HTMLElement;
      if (inner) inner.classList.toggle("open", this.visible);
      if (this.visible) {
        this.renderAlerts();
      }
    }
  }

  private renderAlerts(): void {
    const alerts = store.getAlerts();
    if (this.titleCountEl) {
      this.titleCountEl.textContent = String(alerts.length);
      this.titleCountEl.classList.toggle("has-alerts", alerts.length > 0);
    }

    if (alerts.length === 0) {
      this.listEl.innerHTML = /* html */ `
        <div class="alert-empty">
          <div class="alert-empty__icon">✓</div>
          <div class="alert-empty__title">ALL SYSTEMS NOMINAL</div>
          <div class="alert-empty__sub">No active system alerts</div>
        </div>
      `;
      return;
    }

    this.listEl.innerHTML = alerts
      .slice(0, 30)
      .map((a) => this.alertHTML(a))
      .join("");
  }

  private alertHTML(alert: StoreAlert): string {
    const typeClass = {
      battery_low: "alert-warn",
      signal_lost: "alert-danger",
      waypoint_reached: "alert-info",
      emergency: "alert-danger",
    }[alert.type] ?? "alert-info";

    const typeIcon = {
      battery_low: "⚡",
      signal_lost: "📡",
      waypoint_reached: "✓",
      emergency: "⚠",
    }[alert.type] ?? "ℹ";

    const age = Date.now() - alert.timestamp;
    const ageStr = age < 60000 ? `${Math.max(1, Math.round(age / 1000))}s ago` : `${Math.round(age / 60000)}m ago`;

    return /* html */ `
      <div class="alert-item ${typeClass} ${alert.read ? "read" : "unread"}" data-drone-id="${alert.droneId}" title="Click to view drone on map">
        <span class="alert-item__icon">${typeIcon}</span>
        <div class="alert-item__body">
          <div class="alert-item__msg">${alert.message}</div>
          <div class="alert-item__meta">
            <span class="alert-item__drone">${alert.droneName}</span>
            <span class="alert-item__dot">•</span>
            <span class="alert-item__time">${ageStr}</span>
          </div>
        </div>
        <button class="alert-dismiss-btn" data-id="${alert.id}" title="Dismiss alert">✕</button>
      </div>
    `;
  }
}

customElements.define("alert-panel", AlertPanelElement);
