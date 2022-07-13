/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type RescanAccountRequest = { follow?: boolean; reset?: boolean }
export type RescanAccountResponse = { sequence: number; startedAt: number; endSequence: number }

export const RescanAccountRequestSchema: yup.ObjectSchema<RescanAccountRequest> = yup
  .object({
    follow: yup.boolean().optional(),
    reset: yup.boolean().optional(),
  })
  .defined()

export const RescanAccountResponseSchema: yup.ObjectSchema<RescanAccountResponse> = yup
  .object({
    sequence: yup.number().defined(),
    endSequence: yup.number().defined(),
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
      if (node.accounts.updateHeadState) {
        await node.accounts.updateHeadState.abort()
      }

      if (request.data.reset) {
        await node.accounts.reset()
      }

      void node.accounts.scanTransactions()
      scan = node.accounts.scan

      if (!scan) {
        node.accounts.logger.warn(`Attempted to start accounts scan but one did not start.`)
      }
    }

    if (scan && request.data.follow) {
      const onTransaction = (sequence: number, endSequence: number) => {
        request.stream({
          sequence: sequence,
          endSequence: endSequence,
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
