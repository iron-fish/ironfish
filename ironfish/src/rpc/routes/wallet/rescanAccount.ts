/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { GENESIS_BLOCK_SEQUENCE } from '../../../primitives'
import { RpcValidationError } from '../../adapters/errors'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type RescanAccountRequest = {
  follow?: boolean
  from?: number
  /**
   * Rescan from the genesis block, ignoring the 'createdAt' field on accounts.
   * Useful if an account may have received a transaction before its 'createdAt' block.
   */
  full?: boolean
}
export type RescanAccountResponse = { sequence: number; startedAt: number; endSequence: number }

export const RescanAccountRequestSchema: yup.ObjectSchema<RescanAccountRequest> = yup
  .object({
    follow: yup.boolean().optional(),
    from: yup.number().optional(),
    full: yup.boolean().optional(),
  })
  .defined()

export const RescanAccountResponseSchema: yup.ObjectSchema<RescanAccountResponse> = yup
  .object({
    sequence: yup.number().defined(),
    endSequence: yup.number().defined(),
    startedAt: yup.number().defined(),
  })
  .defined()

routes.register<typeof RescanAccountRequestSchema, RescanAccountResponse>(
  `${ApiNamespace.wallet}/rescanAccount`,
  RescanAccountRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'logger')

    let scan = context.wallet.scan

    if (scan && !request.data.follow) {
      throw new RpcValidationError(`A transaction rescan is already running`)
    }

    if (!scan) {
      if (context.wallet.updateHeadState) {
        await context.wallet.updateHeadState.abort()
      }

      await context.wallet.reset({ resetCreatedAt: request.data.full })

      let fromHash = undefined
      if (request.data.from && request.data.from > GENESIS_BLOCK_SEQUENCE) {
        const response = await context.wallet.chainGetBlock({ sequence: request.data.from })

        if (response === null) {
          throw new RpcValidationError(
            `No block header found in the chain at sequence ${request.data.from}`,
          )
        }

        fromHash = Buffer.from(response.block.hash, 'hex')

        for (const account of context.wallet.listAccounts()) {
          await account.updateHead({
            hash: Buffer.from(response.block.previousBlockHash, 'hex'),
            sequence: response.block.sequence - 1,
          })
        }
      }

      void context.wallet.scanTransactions(fromHash)
      scan = context.wallet.scan

      if (!scan) {
        context.logger.warn(`Attempted to start accounts scan but one did not start.`)
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
