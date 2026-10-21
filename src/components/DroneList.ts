/**
 * <drone-list> Web Component
 * Virtualized, high-performance list of drones with real-time status updates.
 * Preserves DOM nodes across telemetry ticks to ensure 100% reliable click events
 * and smooth scrolling without garbage collection stutter.
 */

import { store } from "../core/DroneStore";
import type { DroneSnapshot, DroneStatus } from "../types";

const STATUS_LABEL: Record<DroneStatus, string> = {
  active: "ACTIVE",
  mission: "MISSION",
  warning: "WARNING",
  lost_signal: "NO SIGNAL",
  returning: "RTB",
  idle: "IDLE",
};

const STATUS_CLASS: Record<DroneStatus, string> = {
  active: "status-active",
  mission: "status-mission",
  warning: "status-warning",
  lost_signal: "status-lost",
  returning: "status-returning",
  idle: "status-idle",
};

interface ItemRefs {
  statusEl: HTMLElement;
  missionEl: HTMLElement;
  altEl: HTMLElement;
  batFill: HTMLElement;
  batVal: HTMLElement;
  sigFill: HTMLElement;
  sigVal: HTMLElement;
  lastStatus: DroneStatus;
  lastBatClass: string;
}

export class DroneListElement extends HTMLElement {
  private itemEls = new Map<string, HTMLElement>();
  private unsubscribe: (() => void) | null = null;
  private filterText = "";
  private statusFilter: "ALL" | "ALERTS" | "ACTIVE" | "MISSION" = "ALL";
  private renderScheduled = false;
  private container!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private countEl!: HTMLElement;
  private footerInfoEl!: HTMLElement;
  private lastSelectedId: string | null = null;

  connectedCallback(): void {
    this.innerHTML = /* html */ `
      <div class="drone-list">
        <div class="drone-list__header">
          <span class="drone-list__title">FLEET UNITS</span>
          <span class="drone-list__count" id="dl-count">0 units</span>
        </div>
        <div class="drone-list__filters">
          <button class="drone-filter-btn active" data-filter="ALL">ALL</button>
          <button class="drone-filter-btn filter-alerts" data-filter="ALERTS">ALERTS</button>
          <button class="drone-filter-btn" data-filter="ACTIVE">ACTIVE</button>
          <button class="drone-filter-btn" data-filter="MISSION">MISSION</button>
        </div>
        <div class="drone-list__search">
          <input id="dl-search" type="text" placeholder="SEARCH ID, MISSION, STATUS..." autocomplete="off" />
        </div>
        <div class="drone-list__items" id="dl-items"></div>
        <div class="drone-list__footer" id="dl-footer">
          <span id="dl-footer-text">SCROLL FOR ALL UNITS</span>
          <button id="dl-scroll-top" class="dl-mini-btn" title="Scroll to top">▲ TOP</button>
        </div>
      </div>
    `;

    this.container = this.querySelector("#dl-items") as HTMLElement;
    this.countEl = this.querySelector("#dl-count") as HTMLElement;
    this.searchInput = this.querySelector("#dl-search") as HTMLInputElement;
    this.footerInfoEl = this.querySelector("#dl-footer-text") as HTMLElement;

    // Search filter input
    this.searchInput.addEventListener("input", () => {
      this.filterText = this.searchInput.value.trim().toLowerCase();
      this.scheduleRender();
    });

    // Quick filter buttons
    const filterBtns = this.querySelectorAll<HTMLButtonElement>(".drone-filter-btn");
    filterBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        filterBtns.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        this.statusFilter = btn.dataset.filter as any;
        this.scheduleRender();
      });
    });

    // Scroll to top button
    const topBtn = this.querySelector("#dl-scroll-top") as HTMLButtonElement | null;
    topBtn?.addEventListener("click", () => {
      this.container.scrollTo({ top: 0, behavior: "smooth" });
    });

    // Event delegation for rock-solid click handling
    this.container.addEventListener("click", (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>(".drone-item");
      if (!item) return;
      const droneId = item.dataset.id;
      if (!droneId) return;

      const isSelected = store.selectedDroneId === droneId;
      const nextId = isSelected ? null : droneId;
      store.selectDrone(nextId);

      if (nextId) {
        const d = store.getDrone(nextId);
        if (d) {
          const mapView = document.querySelector("map-view") as any;
          mapView?.flyTo(d.lat, d.lon);
        }
      }
    });

    this.unsubscribe = store.on((event) => {
      if (event === "init") {
        this.itemEls.clear();
        this.container.innerHTML = "";
        this.scheduleRender();
      } else if (event === "update") {
        this.scheduleRender();
      }
    });

    if (store.getAllDrones().length > 0) {
      this.scheduleRender();
    }
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.render();
    });
  }

  private render(): void {
    const allDrones = store.getDronesSorted();
    const drones = allDrones.filter((d) => {
      // Status filter
      if (this.statusFilter === "ALERTS" && d.status !== "warning" && d.status !== "lost_signal") return false;
      if (this.statusFilter === "ACTIVE" && d.status !== "active") return false;
      if (this.statusFilter === "MISSION" && d.status !== "mission") return false;

      // Text filter
      if (this.filterText !== "") {
        return (
          d.id.toLowerCase().includes(this.filterText) ||
          d.mission.toLowerCase().includes(this.filterText) ||
          d.status.toLowerCase().includes(this.filterText)
        );
      }
      return true;
    });

    const selectedId = store.selectedDroneId;
    this.countEl.textContent = `${drones.length} / ${allDrones.length}`;
    if (this.footerInfoEl) {
      this.footerInfoEl.textContent = `${drones.length} UNITS LISTED • SCROLL`;
    }

    // Collect IDs in current filtered set
    const visibleIds = new Set(drones.map((d) => d.id));

    // Remove items no longer visible
    for (const [id, el] of this.itemEls) {
      if (!visibleIds.has(id)) {
        el.remove();
        this.itemEls.delete(id);
      }
    }

    // Update or create items without wiping innerHTML
    for (let i = 0; i < drones.length; i++) {
      const drone = drones[i];
      let el = this.itemEls.get(drone.id);

      if (!el) {
        el = this.createItem(drone);
        this.itemEls.set(drone.id, el);
      } else {
        this.updateItem(el, drone);
      }

      const isSelected = drone.id === selectedId;
      if (el.classList.contains("selected") !== isSelected) {
        el.classList.toggle("selected", isSelected);
      }

      // Ensure correct DOM ordering only when needed
      if (this.container.children[i] !== el) {
        this.container.insertBefore(el, this.container.children[i] ?? null);
      }
    }

    // Auto-scroll to selected drone if selection just changed from elsewhere (e.g. map)
    if (selectedId && selectedId !== this.lastSelectedId) {
      this.lastSelectedId = selectedId;
      const selectedEl = this.itemEls.get(selectedId);
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    } else if (!selectedId) {
      this.lastSelectedId = null;
    }
  }

  private createItem(drone: DroneSnapshot): HTMLElement {
    const el = document.createElement("div");
    el.className = "drone-item";
    el.dataset.id = drone.id;

    const batteryClass =
      drone.battery < 20 ? "bat-critical" :
      drone.battery < 40 ? "bat-low" : "bat-ok";

    el.innerHTML = /* html */ `
      <div class="drone-item__header">
        <div class="drone-item__id">${drone.id}</div>
        <div class="drone-item__status ${STATUS_CLASS[drone.status]}">${STATUS_LABEL[drone.status]}</div>
      </div>
      <div class="drone-item__meta">
        <span class="drone-item__mission">${drone.mission}</span>
        <span class="drone-item__alt">${drone.alt.toFixed(0)}m</span>
      </div>
      <div class="drone-item__bars">
        <div class="bar-row">
          <span class="bar-label">BAT</span>
          <div class="bar-track">
            <div class="bar-fill ${batteryClass}" style="width:${drone.battery.toFixed(0)}%"></div>
          </div>
          <span class="bar-val">${drone.battery.toFixed(0)}%</span>
        </div>
        <div class="bar-row">
          <span class="bar-label">SIG</span>
          <div class="bar-track">
            <div class="bar-fill sig" style="width:${drone.signal.toFixed(0)}%"></div>
          </div>
          <span class="bar-val">${drone.signal.toFixed(0)}%</span>
        </div>
      </div>
    `;

    // Cache dynamic references to avoid innerHTML wipes on update
    const refs: ItemRefs = {
      statusEl: el.querySelector(".drone-item__status") as HTMLElement,
      missionEl: el.querySelector(".drone-item__mission") as HTMLElement,
      altEl: el.querySelector(".drone-item__alt") as HTMLElement,
      batFill: el.querySelector(".bar-fill") as HTMLElement,
      batVal: el.querySelectorAll(".bar-val")[0] as HTMLElement,
      sigFill: el.querySelectorAll(".bar-fill")[1] as HTMLElement,
      sigVal: el.querySelectorAll(".bar-val")[1] as HTMLElement,
      lastStatus: drone.status,
      lastBatClass: batteryClass,
    };

    (el as any).__refs = refs;
    return el;
  }

  private updateItem(el: HTMLElement, drone: DroneSnapshot): void {
    const refs = (el as any).__refs as ItemRefs | undefined;
    if (!refs) {
      // Fallback
      return;
    }

    // Update status badge if status changed
    if (refs.lastStatus !== drone.status) {
      refs.lastStatus = drone.status;
      refs.statusEl.className = `drone-item__status ${STATUS_CLASS[drone.status]}`;
      refs.statusEl.textContent = STATUS_LABEL[drone.status];
    }

    // Update altitude
    const altText = `${drone.alt.toFixed(0)}m`;
    if (refs.altEl.textContent !== altText) {
      refs.altEl.textContent = altText;
    }

    // Update battery bar & value
    const batValText = `${drone.battery.toFixed(0)}%`;
    if (refs.batVal.textContent !== batValText) {
      refs.batVal.textContent = batValText;
      refs.batFill.style.width = batValText;

      const batClass =
        drone.battery < 20 ? "bat-critical" :
        drone.battery < 40 ? "bat-low" : "bat-ok";

      if (refs.lastBatClass !== batClass) {
        refs.lastBatClass = batClass;
        refs.batFill.className = `bar-fill ${batClass}`;
      }
    }

    // Update signal bar & value
    const sigValText = `${drone.signal.toFixed(0)}%`;
    if (refs.sigVal.textContent !== sigValText) {
      refs.sigVal.textContent = sigValText;
      refs.sigFill.style.width = sigValText;
    }
  }
}

customElements.define("drone-list", DroneListElement);
