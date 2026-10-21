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
        <!-- Sparkline charts with reference values & timeline -->
        <div class="telem-charts">
          <div class="telem-chart">
            <div class="telem-chart__header">
              <span class="telem-chart__title">BATTERY HISTORY</span>
              <span class="telem-chart__curr" id="chart-curr-bat" style="color:#ffaa00">${drone.battery.toFixed(0)}%</span>
            </div>
            <canvas id="chart-bat" class="sparkline"></canvas>
            <div class="telem-chart__meta">
              <span class="telem-chart__time">T-60s</span>
              <span class="telem-chart__stats" id="chart-stat-bat">--</span>
              <span class="telem-chart__time">NOW</span>
            </div>
          </div>

          <div class="telem-chart">
            <div class="telem-chart__header">
              <span class="telem-chart__title">ALTITUDE HISTORY</span>
              <span class="telem-chart__curr" id="chart-curr-alt" style="color:#00aaff">${drone.alt.toFixed(0)} m</span>
            </div>
            <canvas id="chart-alt" class="sparkline"></canvas>
            <div class="telem-chart__meta">
              <span class="telem-chart__time">T-60s</span>
              <span class="telem-chart__stats" id="chart-stat-alt">--</span>
              <span class="telem-chart__time">NOW</span>
            </div>
          </div>

          <div class="telem-chart">
            <div class="telem-chart__header">
              <span class="telem-chart__title">SPEED HISTORY</span>
              <span class="telem-chart__curr" id="chart-curr-spd" style="color:#00ff88">${drone.speed.toFixed(1)} m/s</span>
            </div>
            <canvas id="chart-spd" class="sparkline"></canvas>
            <div class="telem-chart__meta">
              <span class="telem-chart__time">T-60s</span>
              <span class="telem-chart__stats" id="chart-stat-spd">--</span>
              <span class="telem-chart__time">NOW</span>
            </div>
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

    this.updateValues(drone);
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

    // Update live values and min/max stats
    const updateStats = (
      statId: string,
      currId: string,
      val: number,
      history: number[],
      unit: string,
      decimals: number = 0
    ) => {
      const currEl = get(currId);
      if (currEl) currEl.textContent = `${val.toFixed(decimals)} ${unit}`.trim();

      const statEl = get(statId);
      if (statEl && history.length > 0) {
        const min = Math.min(...history);
        const max = Math.max(...history);
        statEl.textContent = `MIN ${min.toFixed(decimals)}${unit} · MAX ${max.toFixed(decimals)}${unit}`;
      }
    };

    updateStats("chart-stat-bat", "chart-curr-bat", drone.battery, drone.batteryHistory, "%", 0);
    updateStats("chart-stat-alt", "chart-curr-alt", drone.alt, drone.altHistory, "m", 0);
    updateStats("chart-stat-spd", "chart-curr-spd", drone.speed, drone.speedHistory, "m/s", 1);

    this.drawSparklines(drone);
  }

  private drawSparklines(drone: DroneSnapshot): void {
    this.drawSparkline("chart-bat", drone.batteryHistory, "#ffaa00", 0, 100, "%");
    this.drawSparkline("chart-alt", drone.altHistory, "#00aaff", 0, 300, "m");
    this.drawSparkline("chart-spd", drone.speedHistory, "#00ff88", 0, 40, "m/s");
  }

  private drawSparkline(
    id: string,
    data: number[],
    color: string,
    scaleMin: number,
    scaleMax: number,
    unit: string
  ): void {
    const canvas = this.querySelector(`#${id}`) as HTMLCanvasElement | null;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 244;
    const cssH = canvas.clientHeight || 58;

    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, cssW, cssH);

    // Padding for Y-axis reference labels
    const leftPad = 34;
    const rightPad = 8;
    const topPad = 8;
    const bottomPad = 8;
    const plotW = cssW - leftPad - rightPad;
    const plotH = cssH - topPad - bottomPad;

    const range = scaleMax - scaleMin || 1;
    const getY = (val: number) => {
      const clamped = Math.max(scaleMin, Math.min(scaleMax, val));
      const norm = (clamped - scaleMin) / range;
      return topPad + (1 - norm) * plotH;
    };

    // ── Y-Axis Scale Labels & Grid Lines ────────────────
    ctx.font = "8px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "right";

    const midVal = Math.round((scaleMax + scaleMin) / 2);
    const levels = [
      { val: scaleMax, label: `${scaleMax}${unit}`, isMid: false },
      { val: midVal, label: `${midVal}${unit}`, isMid: true },
      { val: scaleMin, label: `${scaleMin}${unit}`, isMid: false },
    ];

    levels.forEach((lvl) => {
      const y = getY(lvl.val);

      // Label on the left
      ctx.fillStyle = lvl.isMid ? "rgba(184, 202, 219, 0.75)" : "rgba(114, 178, 241, 0.55)";
      ctx.fillText(lvl.label, leftPad - 5, y);

      // Horizontal grid line across plot area
      ctx.beginPath();
      ctx.strokeStyle = lvl.isMid ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      if (lvl.isMid) {
        ctx.setLineDash([3, 3]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.moveTo(leftPad, y);
      ctx.lineTo(cssW - rightPad, y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    if (data.length < 2) {
      ctx.restore();
      return;
    }

    // ── Gradient Area Fill Under Curve ──────────────────
    const gradient = ctx.createLinearGradient(0, topPad, 0, cssH - bottomPad);
    gradient.addColorStop(0, `${color}40`);
    gradient.addColorStop(1, `${color}00`);

    const step = plotW / (data.length - 1);

    ctx.beginPath();
    ctx.moveTo(leftPad, getY(data[0]));
    for (let i = 1; i < data.length; i++) {
      const x = leftPad + i * step;
      const y = getY(data[i]);
      ctx.lineTo(x, y);
    }
    ctx.lineTo(leftPad + (data.length - 1) * step, cssH - bottomPad);
    ctx.lineTo(leftPad, cssH - bottomPad);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    // ── Line Stroke ──────────────────────────────────────
    ctx.beginPath();
    ctx.moveTo(leftPad, getY(data[0]));
    for (let i = 1; i < data.length; i++) {
      const x = leftPad + i * step;
      const y = getY(data[i]);
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.stroke();

    // ── Current Value Head Dot with Glow ─────────────────
    const lastX = leftPad + (data.length - 1) * step;
    const lastY = getY(data[data.length - 1]);

    // Outer glow
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Inner bright center
    ctx.beginPath();
    ctx.arc(lastX, lastY, 2, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();

    ctx.restore();
  }
}

customElements.define("telemetry-panel", TelemetryPanelElement);
