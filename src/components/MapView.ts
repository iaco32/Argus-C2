/**
 * <map-view> Web Component
 * Interactive map using OpenStreetMap tiles with PixiJS overlay for drone rendering.
 *
 * Architecture:
 * - Leaflet handles map tiles, zoom, pan (DOM layer)
 * - PixiJS Canvas overlay renders drone icons at 60fps
 * - Only dirty drones trigger sprite updates (dirty tracking)
 * - Map click hit-testing allows selecting drones directly on the canvas
 */

import * as PIXI from "pixi.js";
import { store } from "../core/DroneStore";
import { scheduler } from "../core/Scheduler";
import type { DroneSnapshot } from "../types";

// ─── Leaflet via CDN (no bundler import needed) ───────────────────────────────
declare const L: any; // Leaflet loaded via script tag in index.html

const STATUS_COLORS: Record<string, number> = {
  active: 0x00ff88,
  mission: 0x00aaff,
  warning: 0xffaa00,
  lost_signal: 0xff3344,
  returning: 0xaa88ff,
  idle: 0x888888,
};

export class MapViewElement extends HTMLElement {
  private map: any = null; // Leaflet map
  private pixiApp: PIXI.Application | null = null;
  private overlayCanvas: HTMLCanvasElement | null = null;
  private droneSprites = new Map<string, PIXI.Container>();
  private unsubscribe: (() => void) | null = null;
  private pendingResize = false;

  connectedCallback(): void {
    this.style.display = "block";
    this.style.width = "100%";
    this.style.height = "100%";
    this.style.position = "relative";

    this.waitForLeaflet().then(() => this.init());
  }

  disconnectedCallback(): void {
    this.unsubscribe?.();
    scheduler.remove("map-view");
    this.pixiApp?.destroy(true);
    this.map?.remove();
  }

  private async waitForLeaflet(): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (typeof L !== "undefined") resolve();
        else setTimeout(check, 50);
      };
      check();
    });
  }

  private async init(): Promise<void> {
    // ── Leaflet map ──────────────────────────────────────────────────────────
    const mapDiv = document.createElement("div");
    mapDiv.style.width = "100%";
    mapDiv.style.height = "100%";
    this.appendChild(mapDiv);

    this.map = L.map(mapDiv, {
      center: [50.4501, 30.5234],
      zoom: 10,
      zoomControl: true,
      attributionControl: false,
    });

    // Dark OSM tile layer (free, no API key needed)
    L.tileLayer(
      "https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png",
      {
        maxZoom: 20,
        attribution: '&copy; Stadia Maps &copy; OpenStreetMap',
      }
    ).addTo(this.map);

    // ── PixiJS overlay ───────────────────────────────────────────────────────
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.style.position = "absolute";
    this.overlayCanvas.style.top = "0";
    this.overlayCanvas.style.left = "0";
    this.overlayCanvas.style.pointerEvents = "none";
    this.overlayCanvas.style.zIndex = "400";
    mapDiv.appendChild(this.overlayCanvas);

    this.pixiApp = new PIXI.Application();
    await this.pixiApp.init({
      canvas: this.overlayCanvas,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    });

    this.pixiApp.stage.sortableChildren = true;
    this.resizeOverlay();

    // Resize and reposition on map moves/zooms
    this.map.on("move zoom moveend zoomend resize", () => {
      this.pendingResize = true;
      this.updateAllSprites();
    });

    // Handle map click: select drone if clicked near one
    this.map.on("click", (e: any) => {
      const clickPt = e.containerPoint;
      let closestId: string | null = null;
      let minDist = 24; // 24px hit tolerance

      for (const [id, sprite] of this.droneSprites) {
        const dist = Math.hypot(sprite.x - clickPt.x, sprite.y - clickPt.y);
        if (dist < minDist) {
          minDist = dist;
          closestId = id;
        }
      }

      if (closestId) {
        const isSelected = store.selectedDroneId === closestId;
        const nextId = isSelected ? null : closestId;
        store.selectDrone(nextId);
        if (nextId) {
          const drone = store.getDrone(nextId);
          if (drone) this.flyTo(drone.lat, drone.lon);
        }
      }
    });

    // Hover cursor feedback over map drones
    this.map.on("mousemove", (e: any) => {
      const pt = e.containerPoint;
      let hovering = false;
      for (const [, sprite] of this.droneSprites) {
        if (Math.hypot(sprite.x - pt.x, sprite.y - pt.y) < 20) {
          hovering = true;
          break;
        }
      }
      mapDiv.style.cursor = hovering ? "crosshair" : "";
    });

    // Handle window resize
    const resizeObserver = new ResizeObserver(() => {
      this.resizeOverlay();
      this.updateAllSprites();
    });
    resizeObserver.observe(this);

    // ── Subscribe to store ───────────────────────────────────────────────────
    this.unsubscribe = store.on((event) => {
      if (event === "init") {
        this.rebuildAllSprites();
      } else if (event === "update") {
        this.updateDirtySprites();
      }
    });

    // ── Render loop ──────────────────────────────────────────────────────────
    scheduler.add("map-view", () => {
      if (this.pendingResize) {
        this.resizeOverlay();
        this.pendingResize = false;
      }
    });

    // Initial render if drones already loaded
    if (store.getAllDrones().length > 0) {
      this.rebuildAllSprites();
    }
  }

  private resizeOverlay(): void {
    if (!this.overlayCanvas || !this.pixiApp || !this.map) return;
    const mapEl = this.map.getContainer() as HTMLElement;
    const w = mapEl.offsetWidth;
    const h = mapEl.offsetHeight;
    this.overlayCanvas.style.width = `${w}px`;
    this.overlayCanvas.style.height = `${h}px`;
    this.pixiApp.renderer.resize(w, h);
  }

  private latLonToPixel(lat: number, lon: number): { x: number; y: number } {
    const point = this.map.latLngToContainerPoint(L.latLng(lat, lon));
    return { x: point.x, y: point.y };
  }

  private createDroneSprite(drone: DroneSnapshot): PIXI.Container {
    const container = new PIXI.Container();

    // 0: Selection Reticle (hidden by default)
    const reticle = new PIXI.Graphics();
    container.addChild(reticle);

    // 1: Status Aura Ring
    const ring = new PIXI.Graphics();
    container.addChild(ring);

    // 2: Drone Heading Arrow (Body)
    const body = new PIXI.Graphics();
    container.addChild(body);

    // 3: ID label
    const label = new PIXI.Text({
      text: drone.id.replace("DRONE-", ""),
      style: {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: 9,
        fontWeight: "bold",
        fill: 0xffffff,
        align: "center",
      },
    });
    label.anchor.set(0.5, 0);
    label.position.set(0, 13);
    container.addChild(label);

    this.renderSpriteVisuals(container, drone, drone.id === store.selectedDroneId);
    return container;
  }

  private renderSpriteVisuals(container: PIXI.Container, drone: DroneSnapshot, isSelected: boolean): void {
    const color = STATUS_COLORS[drone.status] ?? 0x00ff88;
    const reticle = container.children[0] as PIXI.Graphics;
    const ring = container.children[1] as PIXI.Graphics;
    const body = container.children[2] as PIXI.Graphics;

    // Draw reticle (targeting brackets) if selected
    reticle.clear();
    if (isSelected) {
      reticle.circle(0, 0, 18);
      reticle.stroke({ color: 0x00ffff, width: 1.5, alpha: 0.9 });
      // Crosshair corners
      reticle.rect(-20, -20, 4, 1.5);
      reticle.rect(-20, -20, 1.5, 4);
      reticle.rect(16, -20, 4, 1.5);
      reticle.rect(18.5, -20, 1.5, 4);
      reticle.rect(-20, 18.5, 4, 1.5);
      reticle.rect(-20, 16, 1.5, 4);
      reticle.rect(16, 18.5, 4, 1.5);
      reticle.rect(18.5, 16, 1.5, 4);
      reticle.fill({ color: 0x00ffff, alpha: 0.8 });
    }

    // Status ring
    ring.clear();
    const radius = isSelected ? 13 : 9;
    ring.circle(0, 0, radius);
    ring.fill({ color, alpha: isSelected ? 0.35 : 0.2 });
    ring.circle(0, 0, radius);
    ring.stroke({ color, width: isSelected ? 2 : 1.5, alpha: 0.9 });

    // Directional arrow
    body.clear();
    const arrowSize = isSelected ? 10 : 7;
    body.moveTo(0, -arrowSize);
    body.lineTo(arrowSize * 0.6, arrowSize * 0.6);
    body.lineTo(0, arrowSize * 0.3);
    body.lineTo(-arrowSize * 0.6, arrowSize * 0.6);
    body.closePath();
    body.fill({ color, alpha: 0.95 });

    container.rotation = (drone.heading * Math.PI) / 180;
    container.scale.set(isSelected ? 1.35 : 1.0);
    container.zIndex = isSelected ? 1000 : 10;
  }

  private rebuildAllSprites(): void {
    if (!this.pixiApp || !this.map) return;

    for (const sprite of this.droneSprites.values()) {
      sprite.destroy({ children: true });
    }
    this.droneSprites.clear();
    this.pixiApp.stage.removeChildren();

    const selectedId = store.selectedDroneId;
    for (const drone of store.getAllDrones()) {
      const sprite = this.createDroneSprite(drone);
      this.droneSprites.set(drone.id, sprite);
      this.pixiApp.stage.addChild(sprite);
      this.positionSprite(sprite, drone);
      this.renderSpriteVisuals(sprite, drone, drone.id === selectedId);
    }
  }

  private updateDirtySprites(): void {
    if (!this.pixiApp || !this.map) return;
    const selectedId = store.selectedDroneId;

    for (const id of store.getDirtyIds()) {
      const drone = store.getDrone(id);
      if (!drone) continue;

      let sprite = this.droneSprites.get(id);
      if (!sprite) {
        sprite = this.createDroneSprite(drone);
        this.droneSprites.set(id, sprite);
        this.pixiApp.stage.addChild(sprite);
      }

      this.positionSprite(sprite, drone);
      this.renderSpriteVisuals(sprite, drone, drone.id === selectedId);
    }

    store.clearDirty();
  }

  private updateAllSprites(): void {
    if (!this.map) return;
    for (const [id, sprite] of this.droneSprites) {
      const drone = store.getDrone(id);
      if (drone) this.positionSprite(sprite, drone);
    }
  }

  private positionSprite(sprite: PIXI.Container, drone: DroneSnapshot): void {
    const { x, y } = this.latLonToPixel(drone.lat, drone.lon);
    sprite.position.set(x, y);
  }

  // Public method to smoothly fly to a drone
  flyTo(lat: number, lon: number, zoom = 12): void {
    this.map?.flyTo([lat, lon], zoom, { duration: 0.6 });
  }
}

customElements.define("map-view", MapViewElement);
