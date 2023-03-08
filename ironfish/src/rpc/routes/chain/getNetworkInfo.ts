/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import * as yup from 'yup'
import { InternalOptions } from '../../../fileStores/internal'
 import { ValidationError } from '../../adapters/errors'
 import { ApiNamespace, router } from '../router'
 
 export type GetNetworkInfoRequest = { name?: string } | undefined
 export type GetNetworkInfoResponse = Partial<InternalOptions>
 
 export const GetNetworkInfoRequestSchema: yup.ObjectSchema<GetNetworkInfoRequest> = yup
   .object({
     name: yup.string().optional(),
   })
   .optional()
 
 export const GetNetworkInfoResponseSchema: yup.ObjectSchema<GetNetworkInfoResponse> =
 yup
   .object({
    isFirstRun: yup.boolean().optional(),
    networkIdentity: yup.string().optional(),
    telemetryNodeId: yup.string().optional(),
    rpcAuthToken: yup.string().optional(),
    networkId: yup.number().optional(),
   })
   .defined()

 router.register<typeof GetNetworkInfoRequestSchema, GetNetworkInfoResponse>(
   `${ApiNamespace.chain}/getNetworkInfo`,
   GetNetworkInfoRequestSchema,
   (request, node): void => {
     if (request.data?.name && !(request.data.name in node.internal.defaults)) {
       throw new ValidationError(`No config option ${String(request.data.name)}`)
     }
 
     let pickKeys: string[] | undefined = undefined
     
     if (request.data?.name) {
       pickKeys = [request.data.name]
     }
 
     const data = JSON.parse(JSON.stringify(node.internal.config, pickKeys)) as GetNetworkInfoResponse
 
     request.end(data)
   },
 )
 