import { credentials } from "@grpc/grpc-js";
import { Empty, LightStreamerClient } from "../models/lightstreamer";

const client = new LightStreamerClient(
  "localhost:50051",
  credentials.createInsecure()
);

client.getServerInfo(Empty, (error, response) => {
  if (error) {
    console.error(error);

    process.exit(1);
  }

  console.info(response);
});
