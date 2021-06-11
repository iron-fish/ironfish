/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ApiNamespace, router } from '../router'
import * as yup from 'yup'
import { runRescan } from './utils'

export type RescanAccountRequest = { follow?: boolean; reset?: boolean }
export type RescanAccountResponse = { sequence: number }

export const RescanAccountRequestSchema: yup.ObjectSchema<RescanAccountRequest> = yup
  .object({
    follow: yup.boolean().optional(),
    reset: yup.boolean().optional(),
  })
  .defined()

export const RescanAccountResponseSchema: yup.ObjectSchema<RescanAccountResponse> = yup
  .object({
    sequence: yup.number().defined(),
  })
  .defined()

router.register<typeof RescanAccountRequestSchema, RescanAccountResponse>(
  `${ApiNamespace.account}/rescanAccount`,
  RescanAccountRequestSchema,
  async (request, node): Promise<void> => {
    const { follow = false, reset = false } = request.data
    const stream = (data: RescanAccountResponse) => {
      request.stream(data)
    }
    await runRescan(node, follow, reset, stream, request.onClose)
    request.end()
  },
)
