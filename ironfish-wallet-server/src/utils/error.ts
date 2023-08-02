import { Metadata, ServiceError as grpcServiceError, status } from '@grpc/grpc-js';

/**
 * https://grpc.io/grpc/node/grpc.html#~ServiceError__anchor
 */
export class ServiceError extends Error implements Partial<grpcServiceError> {
  public override name: string = 'ServiceError';

  constructor(
    public code: status,
    public override message: string,
    public details?: string,
    public metadata?: Metadata,
  ) {
    super(message);
  }
}
