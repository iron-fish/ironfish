import { handleUnaryCall, status, UntypedHandleCall } from "@grpc/grpc-js";

import {
  HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
  HealthCheckRequest,
  HealthService,
  HealthServer,
} from "../models/health";
import { logger, ServiceError } from "../utils";
import type { ServicesMap } from "./types";

type ServiceNames = "" | keyof ServicesMap;

const ServingStatus = HealthCheckResponse_ServingStatus;
const healthStatus: Map<ServiceNames, HealthCheckResponse_ServingStatus> =
  new Map([
    ["", ServingStatus.SERVING],
    ["lightstreamer.LightStreamer", ServingStatus.SERVING],
  ]);

function isValidName(name: string): name is ServiceNames {
  return (healthStatus as Map<string, any>).has(name);
}

/**
 * gRPC Health Check
 * https://github.com/grpc/grpc-node/tree/master/packages/grpc-health-check
 */
class Health implements HealthServer {
  [method: string]: UntypedHandleCall;

  public check: handleUnaryCall<HealthCheckRequest, HealthCheckResponse> = (
    call,
    callback
  ) => {
    const { service } = call.request;
    logger.info("healthCheck", service);

    const serviceStatus = isValidName(service)
      ? healthStatus.get(service)
      : null;

    if (!serviceStatus) {
      return callback(
        new ServiceError(status.NOT_FOUND, "NotFoundService"),
        null
      );
    }

    callback(null, {
      status: serviceStatus,
    });
  };
}

export { Health, HealthService, healthStatus, ServingStatus };
