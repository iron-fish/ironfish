/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ConfigOptions, ConfigOptionsSchema } from '../../../fileStores/config'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, routes } from '../router'

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
  (request, { node }): void => {
    Assert.isNotUndefined(node)

    if (request.data?.name && !(request.data.name in node.config.defaults)) {
      throw new ValidationError(`No config option ${String(request.data.name)}`)
    }

    let pickKeys: string[] | undefined = undefined
    if (!request.data?.user) {
      pickKeys = Object.keys(node.config.defaults)
    }
    if (request.data?.name) {
      pickKeys = [request.data.name]
    }

    const data = (
      request.data?.user
        ? JSON.parse(JSON.stringify(node.config.loaded))
        : JSON.parse(JSON.stringify(node.config.config, pickKeys))
    ) as GetConfigResponse

    request.end(data)
  },
)
