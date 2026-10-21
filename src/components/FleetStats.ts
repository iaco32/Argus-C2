/**
 * <fleet-stats> Web Component
 * Fleet statistics summary with animated counters and collapsible view.
 */

import { store } from "../core/DroneStore";

export class FleetStatsElement extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private renderScheduled = false;
  private isCollapsed = false;

  connectedCallback(): void {
    this.innerHTML = /* html */ `
      <div class="fleet-stats" id="fs-root">
        <div class="fleet-stats__header">
          <div class="fleet-stats__title">FLEET STATUS</div>
          <button class="fs-toggle-btn" id="fs-toggle" title="Toggle Fleet Stats">COLLAPSE ▲</button>
        </div>
        <div class="fleet-stats__body" id="fs-body">
          <div class="fleet-stats__grid">
            <div class="fs-item fs-total">
              <div class="fs-val" id="fs-total">0</div>
              <div class="fs-label">TOTAL</div>
            </div>
            <div class="fs-item fs-active">
              <div class="fs-val" id="fs-active">0</div>
              <div class="fs-label">ACTIVE</div>
            </div>
            <div class="fs-item fs-mission">
              <div class="fs-val" id="fs-mission">0</div>
              <div class="fs-label">MISSION</div>
            </div>
            <div class="fs-item fs-warning">
              <div class="fs-val" id="fs-warning">0</div>
              <div class="fs-label">WARNING</div>
            </div>
            <div class="fs-item fs-lost">
              <div class="fs-val" id="fs-lost">0</div>
              <div class="fs-label">NO SIGNAL</div>
            </div>
            <div class="fs-item fs-returning">
              <div class="fs-val" id="fs-returning">0</div>
              <div class="fs-label">RTB</div>
            </div>
          </div>
          <div class="fleet-stats__avgs">
            <div class="avg-item">
              <span class="avg-label">AVG BATTERY</span>
              <div class="avg-bar-track">
                <div class="avg-bar-fill bat" id="fs-bat-bar"></div>
              </div>
              <span class="avg-val" id="fs-avg-bat">—%</span>
            </div>
            <div class="avg-item">
              <span class="avg-label">AVG SIGNAL</span>
              <div class="avg-bar-track">
                <div class="avg-bar-fill sig" id="fs-sig-bar"></div>
              </div>
              <span class="avg-val" id="fs-avg-sig">—%</span>
            </div>
          </div>
        </div>
      </div>
    `;

    const toggleBtn = this.querySelector("#fs-toggle") as HTMLButtonElement | null;
    const root = this.querySelector("#fs-root") as HTMLElement | null;

    toggleBtn?.addEventListener("click", () => {
      this.isCollapsed = !this.isCollapsed;
      root?.classList.toggle("collapsed", this.isCollapsed);
      if (toggleBtn) {
        toggleBtn.textContent = this.isCollapsed ? "EXPAND ▼" : "COLLAPSE ▲";
      }
    });

    this.unsubscribe = store.on(() => this.scheduleRender());

    if (store.getAllDrones().length > 0) this.scheduleRender();
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.update();
    });
  }

  private update(): void {
    const s = store.getFleetStats();
    const set = (id: string, val: string | number) => {
      const el = this.querySelector(`#${id}`) as HTMLElement | null;
      if (el) el.textContent = String(val);
    };
    const setWidth = (id: string, pct: number) => {
      const el = this.querySelector(`#${id}`) as HTMLElement | null;
      if (el) el.style.width = `${Math.round(pct)}%`;
    };

    set("fs-total", s.total);
    set("fs-active", s.active);
    set("fs-mission", s.mission);
    set("fs-warning", s.warning);
    set("fs-lost", s.lost);
    set("fs-returning", s.returning);
    set("fs-avg-bat", `${s.avgBattery.toFixed(0)}%`);
    set("fs-avg-sig", `${s.avgSignal.toFixed(0)}%`);
    setWidth("fs-bat-bar", s.avgBattery);
    setWidth("fs-sig-bar", s.avgSignal);
  }
}

customElements.define("fleet-stats", FleetStatsElement);
