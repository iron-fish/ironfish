/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ConfigOptions, ConfigOptionsSchema } from '../../../fileStores/config'
import { RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type GetConfigRequest = { user?: boolean; name?: string } | undefined
export type GetConfigResponse = Partial<ConfigOptions>

export const GetConfigRequestSchema: yup.ObjectSchema<GetConfigRequest> = yup
  .object({
    user: yup.boolean().optional(),
    name: yup.string().optional(),
  })
  .optional()

export const GetConfigResponseSchema: yup.ObjectSchema<GetConfigResponse> = ConfigOptionsSchema

routes.register<typeof GetConfigRequestSchema, GetConfigResponse>(
  `${ApiNamespace.config}/getConfig`,
  GetConfigRequestSchema,
  (request, context): void => {
    AssertHasRpcContext(request, context, 'config')

    if (request.data?.name && !(request.data.name in context.config.defaults)) {
      throw new RpcValidationError(`No config option ${String(request.data.name)}`)
    }

    let pickKeys: string[] | undefined = undefined
    if (!request.data?.user) {
      pickKeys = Object.keys(context.config.defaults)
    }
    if (request.data?.name) {
      pickKeys = [request.data.name]
    }

    const data = (
      request.data?.user
        ? JSON.parse(JSON.stringify(context.config.loaded))
        : JSON.parse(JSON.stringify(context.config.config, pickKeys))
    ) as GetConfigResponse

    request.end(data)
  },
)
