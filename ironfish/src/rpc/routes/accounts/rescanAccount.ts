/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type RescanAccountRequest = { follow?: boolean; reset?: boolean }
export type RescanAccountResponse = { sequence: number; startedAt: number }

export const RescanAccountRequestSchema: yup.ObjectSchema<RescanAccountRequest> = yup
  .object({
    follow: yup.boolean().optional(),
    reset: yup.boolean().optional(),
  })
  .defined()

export const RescanAccountResponseSchema: yup.ObjectSchema<RescanAccountResponse> = yup
  .object({
    sequence: yup.number().defined(),
    startedAt: yup.number().defined(),
  })
  .defined()

router.register<typeof RescanAccountRequestSchema, RescanAccountResponse>(
  `${ApiNamespace.account}/rescanAccount`,
  RescanAccountRequestSchema,
  async (request, node): Promise<void> => {
    let scan = node.accounts.scan

    if (scan && !request.data.follow) {
      throw new ValidationError(`A transaction rescan is already running`)
    }

    if (!scan) {
      if (request.data.reset) {
        await node.accounts.reset()
      }
      void node.accounts.scanTransactions()
      scan = node.accounts.scan
    }

    if (scan && request.data.follow) {
      const onTransaction = (sequence: number) => {
        request.stream({
          sequence: Number(sequence),
          startedAt: scan?.startedAt || 0,
        })
      }

      scan.onTransaction.on(onTransaction)
      request.onClose.on(() => {
        scan?.onTransaction.off(onTransaction)
      })

      await scan.wait()
    }

    request.end()
  },
)
