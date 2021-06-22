/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ConfigOptions, ConfigOptionsSchema } from '../../../fileStores/config'
import { ApiNamespace, router } from '../router'
import { setUnknownConfigValue } from './uploadConfig'

export type SetConfigRequest = { name: string; value: unknown }
export type SetConfigResponse = Partial<ConfigOptions>

export const SetConfigRequestSchema: yup.ObjectSchema<SetConfigRequest> = yup
  .object({
    name: yup.string().defined(),
    value: yup.mixed().defined(),
  })
  .defined()

export const SetConfigResponseSchema: yup.ObjectSchema<SetConfigResponse> = ConfigOptionsSchema

router.register<typeof SetConfigRequestSchema, SetConfigResponse>(
  `${ApiNamespace.config}/setConfig`,
  SetConfigRequestSchema,
  async (request, node): Promise<void> => {
    setUnknownConfigValue(node.config, request.data.name, request.data.value)
    await node.config.save()
    request.end()
  },
)
