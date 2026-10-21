// Shared types between server and client
export type DroneStatus = "active" | "warning" | "lost_signal" | "returning" | "idle" | "mission";

export interface DroneSnapshot {
  id: string;
  name: string;
  status: DroneStatus;
  lat: number;
  lon: number;
  alt: number;
  heading: number;
  speed: number;
  battery: number;
  signal: number;
  mission: string;
  batteryHistory: number[];
  altHistory: number[];
  speedHistory: number[];
  waypointProgress: number;
}

export interface AlertPayload {
  droneId: string;
  droneName: string;
  type: "battery_low" | "signal_lost" | "waypoint_reached" | "emergency";
  message: string;
}

export interface TelemetryPacket {
  type: "init" | "telemetry" | "alert" | "config";
  timestamp: number;
  drones?: DroneSnapshot[];
  alert?: AlertPayload;
  droneCount?: number;
}
