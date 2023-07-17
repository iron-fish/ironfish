/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { ConfigOptions, ConfigOptionsSchema } from '../../../fileStores/config'
import { ApiNamespace, routes } from '../router'
import { setUnknownConfigValue } from './uploadConfig'

export type UnsetConfigRequest = { name: string }
export type UnsetConfigResponse = Partial<ConfigOptions>

export const UnsetConfigRequestSchema: yup.ObjectSchema<UnsetConfigRequest> = yup
  .object({
    name: yup.string().defined(),
  })
  .defined()

export const UnsetConfigResponseSchema: yup.ObjectSchema<UnsetConfigResponse> =
  ConfigOptionsSchema

routes.register<typeof UnsetConfigRequestSchema, UnsetConfigResponse>(
  `${ApiNamespace.config}/unsetConfig`,
  UnsetConfigRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    setUnknownConfigValue(node.config, request.data.name)
    await node.config.save()
    request.end()
  },
)
