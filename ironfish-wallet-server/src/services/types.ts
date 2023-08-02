import { LightStreamerService } from "./LightStreamer";
import { HealthService } from "./Health";

export type ServicesMap = {
  "lightstreamer.LightStreamer": LightStreamerService;
  "grpc.health.v1.Health": HealthService;
};
