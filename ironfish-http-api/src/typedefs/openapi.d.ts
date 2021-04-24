declare namespace Components {
    namespace Schemas {
        export interface GetFundsResponse {
            message: string;
        }
        export type WriteTelemetryRequest = {
            /**
             * Identifier for the metric
             */
            name: string; // ^[a-zA-Z][a-zA-Z0-9]+$
            /**
             * Time when the metric was recorded
             */
            timestamp: string; // date-time
            /**
             * Optional collection of properties to identify the metric
             */
            tags?: {
                [name: string]: string;
            };
            /**
             * List of values associated with a specific recording of that metric
             */
            fields: {
                /**
                 * The name of the field being recorded.
                 */
                name: string; // ^[a-zA-Z][a-zA-Z0-9]+$
                string?: string;
                boolean?: boolean;
                float?: number;
                integer?: number;
            }[];
        }[];
    }
}
declare namespace Paths {
    namespace GetFunds {
        namespace Parameters {
            export type Email = string;
            export type PublicKey = string;
        }
        export interface QueryParameters {
            email?: Parameters.Email;
            publicKey: Parameters.PublicKey;
        }
        namespace Responses {
            export type $200 = Components.Schemas.GetFundsResponse;
        }
    }
    namespace WriteTelemetry {
        export type RequestBody = Components.Schemas.WriteTelemetryRequest;
        namespace Responses {
            export interface $200 {
            }
        }
    }
}
