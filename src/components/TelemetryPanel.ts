/**
 * <telemetry-panel> Web Component
 * Shows detailed telemetry for the selected drone with sparkline charts
 * rendered on Canvas (no chart library needed).
 */

import { store } from "../core/DroneStore";
import { scheduler } from "../core/Scheduler";
import type { DroneSnapshot, DroneStatus } from "../types";

const STATUS_CSS: Record<DroneStatus, string> = {
  active: "#00ff88",
  mission: "#00aaff",
  warning: "#ffaa00",
  lost_signal: "#ff3344",
  returning: "#aa88ff",
  idle: "#888888",
};

export class TelemetryPanelElement extends HTMLElement {
  private unsubscribe: (() => void) | null = null;
  private currentDroneId: string | null = null;
  private renderScheduled = false;

  connectedCallback(): void {
    this.render(null);

    this.unsubscribe = store.on(() => {
      const selected = store.getSelectedDrone();
      const id = selected?.id ?? null;

      if (id !== this.currentDroneId) {
        this.currentDroneId = id;
        this.render(selected);
      } else if (id !== null) {
        this.scheduleUpdate(selected!);
      }
    });
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    scheduler.remove("telemetry-panel");
  }

  private scheduleUpdate(drone: DroneSnapshot): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.updateValues(drone);
    });
  }

  private render(drone: DroneSnapshot | null): void {
    if (!drone) {
      this.innerHTML = /* html */ `
        <div class="telem-empty">
          <div class="telem-empty__icon">⊕</div>
          <div class="telem-empty__text">SELECT A DRONE<br/>TO VIEW TELEMETRY</div>
        </div>
      `;
      return;
    }

    const statusColor = STATUS_CSS[drone.status] ?? "#00ff88";

    this.innerHTML = /* html */ `
      <div class="telem-panel">
        <div class="telem-header">
          <div class="telem-id">${drone.id}</div>
          <div class="telem-status" style="color:${statusColor}; border-color:${statusColor}40">
            ${drone.status.replace("_", " ").toUpperCase()}
          </div>
        </div>
        <div class="telem-mission">MISSION: <strong>${drone.mission}</strong></div>

        <!-- Primary metrics grid -->
        <div class="telem-grid">
          <div class="telem-metric">
            <div class="telem-metric__label">ALTITUDE</div>
            <div class="telem-metric__value" id="tm-alt">${drone.alt.toFixed(0)}</div>
            <div class="telem-metric__unit">m AGL</div>
          </div>
          <div class="telem-metric">
            <div class="telem-metric__label">SPEED</div>
            <div class="telem-metric__value" id="tm-spd">${drone.speed.toFixed(1)}</div>
            <div class="telem-metric__unit">m/s</div>
          </div>
          <div class="telem-metric">
            <div class="telem-metric__label">HEADING</div>
            <div class="telem-metric__value" id="tm-hdg">${drone.heading.toFixed(0)}</div>
            <div class="telem-metric__unit">°</div>
          </div>
          <div class="telem-metric">
            <div class="telem-metric__label">BATTERY</div>
            <div class="telem-metric__value ${drone.battery < 20 ? "critical" : ""}" id="tm-bat">${drone.battery.toFixed(0)}</div>
            <div class="telem-metric__unit">%</div>
          </div>
          <div class="telem-metric">
            <div class="telem-metric__label">SIGNAL</div>
            <div class="telem-metric__value" id="tm-sig">${drone.signal.toFixed(0)}</div>
            <div class="telem-metric__unit">%</div>
          </div>
          <div class="telem-metric">
            <div class="telem-metric__label">WP PROG</div>
            <div class="telem-metric__value" id="tm-wp">${(drone.waypointProgress * 100).toFixed(0)}</div>
            <div class="telem-metric__unit">%</div>
          </div>
        </div>

        <!-- GPS coordinates -->
        <div class="telem-gps">
          <span class="telem-gps__label">GPS</span>
          <span class="telem-gps__val" id="tm-lat">${drone.lat.toFixed(5)}° N</span>
          <span class="telem-gps__val" id="tm-lon">${drone.lon.toFixed(5)}° E</span>
        </div>

        <!-- Sparkline charts -->
        <div class="telem-charts">
          <div class="telem-chart">
            <div class="telem-chart__label">BATTERY HISTORY</div>
            <canvas id="chart-bat" width="220" height="48" class="sparkline"></canvas>
          </div>
          <div class="telem-chart">
            <div class="telem-chart__label">ALTITUDE HISTORY</div>
            <canvas id="chart-alt" width="220" height="48" class="sparkline"></canvas>
          </div>
          <div class="telem-chart">
            <div class="telem-chart__label">SPEED HISTORY</div>
            <canvas id="chart-spd" width="220" height="48" class="sparkline"></canvas>
          </div>
        </div>

        <!-- Waypoint progress bar -->
        <div class="telem-mission-bar">
          <div class="telem-mission-bar__label">MISSION PROGRESS</div>
          <div class="telem-mission-bar__track">
            <div class="telem-mission-bar__fill" id="tm-wp-bar" style="width:${(drone.waypointProgress * 100).toFixed(0)}%"></div>
          </div>
        </div>
      </div>
    `;

    this.drawSparklines(drone);
  }

  private updateValues(drone: DroneSnapshot): void {
    const get = (id: string) => this.querySelector(`#${id}`) as HTMLElement | null;

    const setVal = (id: string, val: string) => {
      const el = get(id);
      if (el) el.textContent = val;
    };

    setVal("tm-alt", drone.alt.toFixed(0));
    setVal("tm-spd", drone.speed.toFixed(1));
    setVal("tm-hdg", drone.heading.toFixed(0));
    setVal("tm-bat", drone.battery.toFixed(0));
    setVal("tm-sig", drone.signal.toFixed(0));
    setVal("tm-wp", (drone.waypointProgress * 100).toFixed(0));
    setVal("tm-lat", `${drone.lat.toFixed(5)}° N`);
    setVal("tm-lon", `${drone.lon.toFixed(5)}° E`);

    const wpBar = get("tm-wp-bar") as HTMLElement | null;
    if (wpBar) wpBar.style.width = `${(drone.waypointProgress * 100).toFixed(0)}%`;

    const batEl = get("tm-bat");
    if (batEl) {
      batEl.classList.toggle("critical", drone.battery < 20);
    }

    this.drawSparklines(drone);
  }

  private drawSparklines(drone: DroneSnapshot): void {
    this.drawSparkline("chart-bat", drone.batteryHistory, "#ffaa00", 0, 100);
    this.drawSparkline("chart-alt", drone.altHistory, "#00aaff", 0, 300);
    this.drawSparkline("chart-spd", drone.speedHistory, "#00ff88", 0, 40);
  }

  private drawSparkline(
    id: string,
    data: number[],
    color: string,
    min: number,
    max: number
  ): void {
    const canvas = this.querySelector(`#${id}`) as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const range = max - min;

    ctx.clearRect(0, 0, w, h);

    // Grid line
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (data.length < 2) return;

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, `${color}55`);
    gradient.addColorStop(1, `${color}00`);

    const step = w / (data.length - 1);

    ctx.beginPath();
    ctx.moveTo(0, h - ((data[0] - min) / range) * h);
    for (let i = 1; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - min) / range) * h;
      ctx.lineTo(x, y);
    }

    // Fill under line
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // Line on top
    ctx.beginPath();
    ctx.moveTo(0, h - ((data[0] - min) / range) * h);
    for (let i = 1; i < data.length; i++) {
      const x = i * step;
      const y = h - ((data[i] - min) / range) * h;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Current value dot
    const lastY = h - ((data[data.length - 1] - min) / range) * h;
    ctx.beginPath();
    ctx.arc(w - 2, lastY, 3, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

customElements.define("telemetry-panel", TelemetryPanelElement);
