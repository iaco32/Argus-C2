# ARGUS C2 — Frontline Multi-Drone Command & Control Interface

**ARGUS C2** is a frontline Tactical Command and Control (C2) web application prototype engineered for high-density, real-time multi-UAV (Unmanned Aerial Vehicle) surveillance and fleet coordination.

Built with high-performance vanilla TypeScript, Native Web Components, PixiJS 2D WebGL rendering, and a WebSocket telemetry pipeline, the application is designed to simulate mission-critical frontline drone operations with 60 FPS rendering and minimal memory overhead.

---

## Table of Contents

- [Features](#features)
- [Architecture & Tech Stack](#architecture--tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Starting the Telemetry Server](#starting-the-telemetry-server)
- [Starting the Frontend Application](#starting-the-frontend-application)
- [Running Tests](#running-tests)
  - [Unit Tests (Vitest)](#unit-tests-vitest)
  - [End-to-End Tests (Playwright)](#end-to-end-tests-playwright)
  - [Run All Tests](#run-all-tests)
- [Telemetry Server Protocol](#telemetry-server-protocol)

---

## Features

- **High-Frequency WebSocket Pipeline**: Real-time bi-directional streaming of multi-drone telemetry packets with backpressure management.
- **Interactive 2D Tactical Map (`<map-view>`)**: Powered by PixiJS v8 with hardware-accelerated WebGL rendering, smooth panning, zooming, waypoint tracking, heading vectors, and drone selection reticles. Positioned around the **Poligono Interforze Salto di Quirra (PISQ)** in Sardinia, Italy (`39.55°N, 9.60°E`) over the Tyrrhenian coastal and maritime airspace.
- **Fleet List & Filtering (`<drone-list>`)**:
  - Live search by Drone ID.
  - Quick-filter tabs (`ALL`, `ACTIVE`, `ALERTS`, `RETURNING`).
  - Real-time battery status bars, operational status badges, and stable DOM item updates.
  - Dedicated "Scroll-to-Top" control.
- **Detailed Telemetry Panel (`<telemetry-panel>`)**:
  - Real-time readings for altitude, ground speed, heading, battery percentage, link signal strength, and GPS coordinates.
  - Calibrated HTML5 Canvas sparklines with Y-axis reference scales, dotted mid-level grids, live metric headers, `MIN` / `MAX` statistics, and `T-60s` timeline tracking.
- **System Alerts Drawer (`<alert-panel>`)**:
  - High-visibility tactical red alert feed tracking battery drops, signal degradation, and mission emergencies.
  - Live synchronized alert counters between status bar and drawer (maintains accurate active alert count on drawer open/close).
  - Individual alert dismissal (`✕`) and one-click "CLEAR ALL ALERTS" with nominal system status verification (`ALL SYSTEMS NOMINAL ✓`).
- **Collapsible Fleet Overview (`<fleet-stats>`)**:
  - Expandable bottom panel providing aggregate metrics: active fleet count, alert ratios, and average battery levels.
- **Tactical Status Bar (`<status-bar>`)**:
  - WebSocket connection indicator, live round-trip latency (`PING` in ms), 60 FPS counter, synchronized alert badge, and a simulation transmission rate slider.

---

## Architecture & Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend Framework** | Vanilla TypeScript & Native Web Components (Zero runtime framework overhead) |
| **Map Rendering** | PixiJS v8 (Hardware-accelerated 2D WebGL Canvas) |
| **Styling** | Vanilla CSS with custom military/tactical dark theme design tokens |
| **State Management** | Centralized reactive store (`DroneStore`) with requestAnimationFrame scheduler |
| **Backend Simulator** | Node.js WebSocket Server (`ws`) with native TypeScript type-stripping |
| **Unit Testing** | Vitest with Happy-DOM for component isolation and TDD |
| **E2E Testing** | Playwright with multi-browser automation and interactive UI tooling |
| **Build & Dev Tool** | Vite |

---

## Project Structure

```text
Stark/
├── server/
│   └── sim.ts                   # WebSocket telemetry simulation server
├── src/
│   ├── components/
│   │   ├── AlertPanel.ts        # System alerts slide-over drawer component
│   │   ├── DroneList.ts         # Fleet sidebar with search, filters & scrolling
│   │   ├── FleetStats.ts        # Collapsible bottom fleet statistics component
│   │   ├── MapView.ts           # PixiJS 2D tactical map view
│   │   ├── StatusBar.ts         # Top tactical bar (Ping, FPS, Rate slider, Conn)
│   │   └── TelemetryPanel.ts    # Right telemetry readout & sparkline charts
│   ├── core/
│   │   ├── DroneStore.ts        # Central reactive state store & alert management
│   │   ├── Scheduler.ts         # Animation frame scheduler & render throttling
│   │   └── WsManager.ts         # WebSocket client with reconnection logic
│   ├── main.ts                  # Application bootstrap and component mounting
│   ├── style.css                # Global tactical styling and design system
│   └── types.ts                 # Shared TypeScript interfaces
├── tests/
│   ├── e2e/
│   │   └── app.spec.ts          # Playwright End-to-End test suite (7 full scenarios)
│   └── unit/
│       ├── AlertPanel.test.ts   # Alert component unit tests
│       ├── DroneList.test.ts    # Drone list component unit tests
│       ├── DroneStore.test.ts   # Core state store unit tests
│       └── Scheduler.test.ts    # Render scheduler unit tests
├── index.html                   # Main entrypoint HTML
├── package.json                 # Scripts and dependencies
├── playwright.config.ts         # Playwright test configuration
└── vitest.config.ts             # Vitest test configuration
```

---

## Prerequisites

- **Node.js**: v20+ recommended (Node.js v22+ supports `--experimental-strip-types` out of the box).
- **npm**: v9+

---

## Installation

Clone the repository and install all dependencies:

```bash
npm install
```

To install Playwright browser binaries (required for E2E tests):

```bash
npx playwright install chromium
```

---

## Starting the Telemetry Server

The telemetry simulation server generates realistic drone physics, multi-waypoint navigation paths, battery discharge rates, signal fluctuations, and emergency alerts.

Run the simulation server with:

### Option A: Development Mode (Vite with Hot Module Replacement)

Run both commands in separate terminal tabs:

```bash
# Terminal 1: Start the telemetry simulation server
npm run server

# Terminal 2: Start the Vite dev server
npm run dev
```

- **Frontend URL**: `http://localhost:5173`
- **WebSocket URL**: `ws://localhost:8765`

### Option B: Unified Production / Standalone Server (Single Port)

Build the frontend bundle and serve both the web application and WebSocket from the Node server:

```bash
npm run build
npm start
```

- **Unified Web & WebSocket URL**: `http://localhost:8765` (serves compiled static assets from `dist/` and handles WebSocket connections on the same port).


---

## Running Tests

The project includes both **Unit Tests** (Vitest) for component logic and state management, and **End-to-End Tests** (Playwright) for full browser interaction.

### Unit Tests (Vitest)

Run unit tests directly in your terminal:

```bash
npm test
```

Other available unit test modes:

- **Watch Mode**: `npm run test:watch` (re-runs tests automatically upon file changes)
- **Graphical Test UI**: `npm run test:ui` (launches Vitest's interactive web interface with visual component trees and execution timelines)

---

### End-to-End Tests (Playwright)

Make sure both the simulation server (`npm run server`) and the frontend (`npm run dev`) are running, or let Playwright communicate with the live dev server on port `5173`.

#### 1. Visual / Headed Mode (Recommended for Watching Tests)

To visually watch the tests run in a visible Chromium browser window at a comfortable, human-readable speed with step-by-step pauses:

```bash
npm run test:e2e:headed
```

*In this mode, actions and state changes (selection, drawer opening, alerts clearing, smooth scrolling) are paced with intentional pauses so you can clearly observe every interaction.*

#### 2. Headless Mode (Fast for CI)

To run all 7 E2E tests at maximum speed directly in the terminal:

```bash
npm run test:e2e
```

#### 3. Interactive Playwright UI Mode

To open the full Playwright Test Runner GUI with time-travel scrubbing, DOM snapshots before and after each action, locator pickers, and video recordings:

```bash
npm run test:e2e:ui
```

#### 4. Step-by-Step Debug Mode

To launch Playwright Inspector with "Resume" and "Step Over" buttons to debug test steps one line at a time:

```bash
npm run test:e2e:debug
```

---

### Run All Tests

To run the complete validation suite (both Unit and E2E tests) in one command:

```bash
npm run test:all
```

---

## Telemetry Server Protocol

The frontend communicates with the server via WebSocket JSON packets:

### Inbound Server Packets (Server -> Client)

- `init`: Initial snapshot sent upon connection containing all current drones and configuration.
- `telemetry`: Periodic delta containing current drone coordinates, velocity, battery, heading, and status.
- `alert`: Tactical alert events (`battery_low`, `signal_lost`, `waypoint_reached`, `emergency`).

### Outbound Client Commands (Client -> Server)

- `set_drone_count`: Updates the active simulated fleet size (`{ "type": "set_drone_count", "count": 25 }`).
- `set_tick_rate`: Updates simulation broadcast frequency (`{ "type": "set_tick_rate", "hz": 15 }`).

---

## Deployment (Render.com)

The project includes a unified production server (`server/sim.ts`) capable of serving both the compiled static frontend (`dist/`) and the real-time WebSocket telemetry pipeline on a single HTTP/WS port.

### 1-Click / Blueprint Deployment

1. Sign up or log in to [Render.com](https://render.com).
2. Connect your GitHub account and select the **`Argus-C2`** repository.
3. Click **New +** > **Blueprint** (or create a **Web Service**):
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Environment Variable**: `NODE_VERSION` = `22.12.0`
4. Render will build the Vite assets, launch the Node server, and automatically assign an HTTPS/WSS domain (e.g. `https://argus-c2.onrender.com`).
5. Open your assigned URL in the browser — the frontend will automatically connect to the live WebSocket simulation via secure `wss://`.
