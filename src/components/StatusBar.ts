/**
 * <status-bar> Web Component
 * Top status bar showing: connection state, drone count, fleet stats,
 * FPS counter, WS latency, and drone count slider.
 */

import { store } from "../core/DroneStore";
import { wsManager } from "../core/WsManager";
import { scheduler } from "../core/Scheduler";

export class StatusBarElement extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private wsUnsubscribe: (() => void) | null = null;
  private renderScheduled = false;
  private fpsEl!: HTMLElement;
  private latencyEl!: HTMLElement;
  private slider!: HTMLInputElement;
  private sliderLabel!: HTMLElement;

  connectedCallback(): void {
    this.innerHTML = /* html */ `
      <div class="status-bar">
        <div class="status-bar__brand">
          <span class="status-bar__logo">⬡</span>
          <span class="status-bar__name">ARGUS C2</span>
          <span class="status-bar__sub">FRONTLINE</span>
        </div>

        <div class="status-bar__metrics">
          <div class="status-bar__metric" id="sb-conn">
            <span class="metric-dot disconnected"></span>
            <span class="metric-label">WS</span>
            <span class="metric-val" id="sb-conn-state">CONNECTING</span>
          </div>
          <div class="status-bar__metric" title="WebSocket Network Latency / Round Trip Time">
            <span class="metric-label">PING</span>
            <span class="metric-val" id="sb-latency">— ms</span>
          </div>
          <div class="status-bar__metric" title="Rendering Frames Per Second">
            <span class="metric-label">FPS</span>
            <span class="metric-val" id="sb-fps">—</span>
          </div>
          <div class="status-bar__separator"></div>
          <div class="status-bar__fleet" id="sb-stats">
            <span class="fleet-item active" id="sb-active">0 ACT</span>
            <span class="fleet-item mission" id="sb-mission">0 MSN</span>
            <span class="fleet-item warning" id="sb-warn">0 WRN</span>
            <span class="fleet-item lost" id="sb-lost">0 LST</span>
          </div>
          <div class="status-bar__separator"></div>
          <div class="status-bar__control">
            <span class="metric-label">DRONES</span>
            <input type="range" id="sb-slider" min="1" max="500" value="50" step="1" class="drone-slider" />
            <span class="metric-val" id="sb-slider-label">50</span>
          </div>
          <div class="status-bar__control">
            <span class="metric-label">RATE</span>
            <input type="range" id="sb-rate" min="1" max="30" value="10" step="1" class="drone-slider" />
            <span class="metric-val" id="sb-rate-label">10Hz</span>
          </div>
        </div>

        <div class="status-bar__alert" id="sb-alert-btn">
          <span class="alert-icon">⚠</span>
          <span class="alert-count" id="sb-alert-count">0</span>
        </div>
      </div>
    `;


    this.fpsEl = this.querySelector("#sb-fps") as HTMLElement;
    this.latencyEl = this.querySelector("#sb-latency") as HTMLElement;
    this.slider = this.querySelector("#sb-slider") as HTMLInputElement;
    this.sliderLabel = this.querySelector("#sb-slider-label") as HTMLElement;

    // Drone count slider
    let sliderDebounce: ReturnType<typeof setTimeout>;
    this.slider.addEventListener("input", () => {
      const val = parseInt(this.slider.value);
      this.sliderLabel.textContent = String(val);
      clearTimeout(sliderDebounce);
      sliderDebounce = setTimeout(() => {
        wsManager.send({ type: "set_drone_count", count: val });
      }, 300);
    });

    // Tick rate slider
    const rateSlider = this.querySelector("#sb-rate") as HTMLInputElement;
    const rateLabel = this.querySelector("#sb-rate-label") as HTMLElement;
    rateSlider.addEventListener("input", () => {
      const val = parseInt(rateSlider.value);
      rateLabel.textContent = `${val}Hz`;
      wsManager.send({ type: "set_tick_rate", hz: val });
    });

    // Alert button
    const alertBtn = this.querySelector("#sb-alert-btn") as HTMLElement;
    alertBtn.addEventListener("click", () => {
      document.querySelector("alert-panel")?.toggleAttribute("visible");
    });

    // Subscribe to store updates
    this.unsubscribe = store.on(() => {
      this.scheduleRender();
    });

    // Subscribe to WS state changes
    this.wsUnsubscribe = wsManager.onStateChange((state) => {
      const dot = this.querySelector(".metric-dot") as HTMLElement;
      const stateEl = this.querySelector("#sb-conn-state") as HTMLElement;
      if (dot) {
        dot.className = `metric-dot ${state}`;
      }
      if (stateEl) stateEl.textContent = state.toUpperCase();
    });

    // FPS & Ping update via scheduler with smoothed sampling (updates every 400ms to avoid jitter)
    let lastMetricUpdate = 0;
    let smoothedPing = 0;

    scheduler.add("status-bar", () => {
      const now = performance.now();
      if (now - lastMetricUpdate > 400) {
        lastMetricUpdate = now;
        if (this.fpsEl) this.fpsEl.textContent = String(scheduler.fps);

        const rawPing = wsManager.latency;
        smoothedPing = smoothedPing === 0 ? rawPing : Math.round(smoothedPing * 0.6 + rawPing * 0.4);
        if (this.latencyEl) this.latencyEl.textContent = `${Math.max(1, smoothedPing)} ms`;
      }
    });
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    this.wsUnsubscribe?.();
    scheduler.remove("status-bar");
  }

  private scheduleRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateStats();
    });
  }

  private updateStats(): void {
    const stats = store.getFleetStats();
    const get = (id: string) => this.querySelector(`#${id}`) as HTMLElement | null;

    const set = (id: string, val: string) => {
      const el = get(id);
      if (el) el.textContent = val;
    };

    set("sb-active", `${stats.active} ACT`);
    set("sb-mission", `${stats.mission} MSN`);
    set("sb-warn", `${stats.warning} WRN`);
    set("sb-lost", `${stats.lost} LST`);

    // Alert count (active alerts matching the system alerts drawer)
    const count = store.getAlerts().length;
    const countEl = get("sb-alert-count");
    if (countEl) {
      countEl.textContent = String(count);
      countEl.classList.toggle("has-alerts", count > 0);
    }
    const alertBtn = get("sb-alert-btn");
    if (alertBtn) {
      alertBtn.classList.toggle("has-alerts", count > 0);
    }
  }
}

customElements.define("status-bar", StatusBarElement);
