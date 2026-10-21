/**
 * Battery-aware render scheduler using requestAnimationFrame.
 * Drops to 30fps (or lower) when battery is low to preserve device life.
 * This directly addresses the job requirement:
 * "optimizing for constrained compute and battery life"
 */

type RenderCallback = (dt: number, timestamp: number) => void;

class RenderScheduler {
  private callbacks = new Map<string, RenderCallback>();
  private rafId: number | null = null;
  private lastTime = 0;
  private _fps = 0;
  private fpsCounter = 0;
  private lastFpsUpdate = 0;
  private _targetFps = 60;
  private batteryLevel = 1.0;
  private isCharging = true;

  get fps(): number { return this._fps; }
  get targetFps(): number { return this._targetFps; }

  async init(): Promise<void> {
    // Battery API for power-aware rendering
    if ("getBattery" in navigator) {
      try {
        const battery = await (navigator as any).getBattery();
        this.batteryLevel = battery.level;
        this.isCharging = battery.charging;
        this.updateTargetFps();

        battery.addEventListener("levelchange", () => {
          this.batteryLevel = battery.level;
          this.updateTargetFps();
        });
        battery.addEventListener("chargingchange", () => {
          this.isCharging = battery.charging;
          this.updateTargetFps();
        });
      } catch {
        // Battery API not available, use 60fps
      }
    }
  }

  private updateTargetFps(): void {
    if (this.isCharging || this.batteryLevel > 0.5) {
      this._targetFps = 60;
    } else if (this.batteryLevel > 0.2) {
      this._targetFps = 30;
    } else {
      this._targetFps = 15; // Emergency battery saver
    }
  }

  add(id: string, callback: RenderCallback): void {
    this.callbacks.set(id, callback);
    if (!this.rafId) this.start();
  }

  remove(id: string): void {
    this.callbacks.delete(id);
    if (this.callbacks.size === 0) this.stop();
  }

  private start(): void {
    this.lastTime = performance.now();
    const loop = (timestamp: number) => {
      this.rafId = requestAnimationFrame(loop);

      const minFrameTime = 1000 / this._targetFps;
      const dt = timestamp - this.lastTime;

      // Skip frame if we're ahead of target FPS (battery saving)
      if (dt < minFrameTime * 0.9) return;

      this.lastTime = timestamp;

      // FPS counter
      this.fpsCounter++;
      if (timestamp - this.lastFpsUpdate >= 1000) {
        this._fps = this.fpsCounter;
        this.fpsCounter = 0;
        this.lastFpsUpdate = timestamp;
      }

      const dtSeconds = dt / 1000;
      for (const cb of this.callbacks.values()) {
        cb(dtSeconds, timestamp);
      }
    };

    this.rafId = requestAnimationFrame(loop);
  }

  private stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }
}

export const scheduler = new RenderScheduler();
