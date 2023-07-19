import {
  sendUnaryData,
  ServerDuplexStream,
  ServerReadableStream,
  ServerUnaryCall,
  ServerWritableStream,
  status,
  UntypedHandleCall,
} from "@grpc/grpc-js";
import { randomBytes } from "crypto";

import {
  GreeterServer,
  GreeterService,
  HelloRequest,
  HelloResponse,
} from "../models/helloworld";
import { ServiceError, logger } from "../utils";

/**
 * package helloworld
 * service Greeter
 */
class Greeter implements GreeterServer {
  [method: string]: UntypedHandleCall;

  /**
   * Implements the SayHello RPC method.
   */
  public sayHello(
    call: ServerUnaryCall<HelloRequest, HelloResponse>,
    callback: sendUnaryData<HelloResponse>
  ): void {
    logger.info("sayHello", Date.now());

    const res: Partial<HelloResponse> = {};
    const { name } = call.request;
    logger.info("sayHelloName:", name);

    if (name === "error") {
      // https://grpc.io/grpc/node/grpc.html#.status__anchor
      return callback(
        new ServiceError(status.INVALID_ARGUMENT, "InvalidValue"),
        null
      );
    }

    const metadataValue = call.metadata.get("foo");
    logger.info("sayHelloMetadata:", metadataValue);

    res.message =
      metadataValue.length > 0 ? `foo is ${metadataValue}` : `hello ${name}`;

    const { paramStruct, paramListValue } = call.request;
    const paramValue = <unknown>call.request.paramValue;
    logger.info("sayHelloStruct:", paramStruct);
    logger.info("sayHelloListValue:", paramListValue);
    logger.info("sayHelloValue:", paramValue);

    res.paramStruct = paramStruct;
    res.paramListValue = paramListValue;
    res.paramValue = paramValue;

    callback(null, HelloResponse.fromJSON(res));
  }

  public sayHelloStreamRequest(
    call: ServerReadableStream<HelloRequest, HelloResponse>,
    callback: sendUnaryData<HelloResponse>
  ): void {
    logger.info("sayHelloStreamRequest:", call.getPeer());

    const data: string[] = [];
    call
      .on("data", (req: HelloRequest) => {
        data.push(`${req.name} - ${randomBytes(5).toString("hex")}`);
      })
      .on("end", () => {
        callback(
          null,
          HelloResponse.fromJSON({
            message: data.join("\n"),
          })
        );
      })
      .on("error", (err: Error) => {
        callback(new ServiceError(status.INTERNAL, err.message), null);
      });
  }

  public sayHelloStreamResponse(
    call: ServerWritableStream<HelloRequest, HelloResponse>
  ): void {
    logger.info("sayHelloStreamResponse:", call.request);

    const { name } = call.request;

    for (const text of Array(10)
      .fill("")
      .map(() => randomBytes(5).toString("hex"))) {
      call.write(
        HelloResponse.fromJSON({
          message: `${name} - ${text}`,
        })
      );
    }
    call.end();
  }

  public sayHelloStream(
    call: ServerDuplexStream<HelloRequest, HelloResponse>
  ): void {
    logger.info("sayHelloStream:", call.getPeer());

    call
      .on("data", (req: HelloRequest) => {
        call.write(
          HelloResponse.fromJSON({
            message: `${req.name} - ${randomBytes(5).toString("hex")}`,
          })
        );
      })
      .on("end", () => {
        call.end();
      })
      .on("error", (err: Error) => {
        logger.error("sayHelloStream:", err);
      });
  }
}

export { Greeter, GreeterService };
