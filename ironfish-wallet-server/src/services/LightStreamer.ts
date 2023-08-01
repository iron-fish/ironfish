import { handleUnaryCall, UntypedHandleCall } from "@grpc/grpc-js";

import {
  Empty,
  LightStreamerServer,
  ServerInfo,
  LightStreamerService,
} from "../models/lightstreamer";

class LightStreamer implements LightStreamerServer {
  [method: string]: UntypedHandleCall;

  public getServerInfo: handleUnaryCall<Empty, ServerInfo> = (_, callback) => {
    callback(
      null,
      ServerInfo.fromJSON({
        version: "",
        vendor: "",
        networkId: "",
        nodeVersion: "",
        nodeStatus: "",
        blockHeight: 0,
        blockHash: Buffer.alloc(0),
      })
    );
  };
}

export { LightStreamer, LightStreamerService };
