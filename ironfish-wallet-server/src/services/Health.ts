import {
  sendUnaryData,
  ServerUnaryCall,
  status,
  UntypedHandleCall,
} from "@grpc/grpc-js";

import {
  HealthCheckResponse,
  HealthCheckResponse_ServingStatus,
  HealthCheckRequest,
  HealthService,
  HealthServer,
} from "../models/health";
import { logger, ServiceError } from "../utils";

const ServingStatus = HealthCheckResponse_ServingStatus;
const healthStatus: Map<string, HealthCheckResponse_ServingStatus> = new Map(
  Object.entries({
    "": ServingStatus.SERVING,
    "helloworld.Greeter": ServingStatus.SERVING,
  })
);

/**
 * gRPC Health Check
 * https://github.com/grpc/grpc-node/tree/master/packages/grpc-health-check
 */
class Health implements HealthServer {
  [method: string]: UntypedHandleCall;

  // public check: handleUnaryCall<HealthCheckRequest, HealthCheckResponse> = (call, callback) => {}
  public check(
    call: ServerUnaryCall<HealthCheckRequest, HealthCheckResponse>,
    callback: sendUnaryData<HealthCheckResponse>
  ): void {
    const { service } = call.request;
    logger.info("healthCheck", service);

    const serviceStatus = healthStatus.get(service);
    if (!serviceStatus) {
      return callback(
        new ServiceError(status.NOT_FOUND, "NotFoundService"),
        null
      );
    }

    callback(null, {
      status: serviceStatus,
    });
  }
}

export { Health, HealthService, healthStatus, ServingStatus };
