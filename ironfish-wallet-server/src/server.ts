import "source-map-support/register";
import { Server, ServerCredentials } from "@grpc/grpc-js";
import { Health, HealthService } from "./services/Health";
import { LightStreamer, LightStreamerService } from "./services/LightStreamer";
import { logger } from "./utils";

const server = new Server({
  "grpc.max_receive_message_length": -1,
  "grpc.max_send_message_length": -1,
});

server.addService(HealthService, new Health());
server.addService(LightStreamerService, new LightStreamer());
server.bindAsync(
  "0.0.0.0:50051",
  ServerCredentials.createInsecure(),
  (err: Error | null, bindPort: number) => {
    if (err) {
      throw err;
    }

    logger.info(`gRPC:Server:${bindPort}`, new Date().toLocaleString());
    server.start();
  }
);
