/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { ValidationError } from '../../adapters/errors'
import { ApiNamespace, router } from '../router'

export type RescanAccountRequest = { follow?: boolean; from?: number }
export type RescanAccountResponse = { sequence: number; startedAt: number; endSequence: number }

export const RescanAccountRequestSchema: yup.ObjectSchema<RescanAccountRequest> = yup
  .object({
    follow: yup.boolean().optional(),
    from: yup.number().optional(),
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
  `${ApiNamespace.wallet}/rescanAccount`,
  RescanAccountRequestSchema,
  async (request, { node }): Promise<void> => {
    Assert.isNotUndefined(node)

    let scan = node.wallet.scan

    if (scan && !request.data.follow) {
      throw new ValidationError(`A transaction rescan is already running`)
    }

    if (!scan) {
      if (node.wallet.updateHeadState) {
        await node.wallet.updateHeadState.abort()
      }

      await node.wallet.reset()

      let fromHash = undefined
      if (request.data.from && request.data.from > GENESIS_BLOCK_SEQUENCE) {
        const header = await node.chain.getHeaderAtSequence(request.data.from)

        if (header === null) {
          throw new ValidationError(
            `No block header found in the chain at sequence ${request.data.from}`,
          )
        }

        fromHash = header.hash

        for (const account of node.wallet.listAccounts()) {
          await account.updateHead({
            hash: header.previousBlockHash,
            sequence: header.sequence - 1,
          })
        }
      }

      void node.wallet.scanTransactions(fromHash)
      scan = node.wallet.scan

      if (!scan) {
        node.wallet.logger.warn(`Attempted to start accounts scan but one did not start.`)
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
