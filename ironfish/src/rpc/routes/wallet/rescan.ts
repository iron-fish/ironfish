/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace } from '../namespaces'
import { routes } from '../router'
import { AssertHasRpcContext } from '../rpcContext'

export type RescanRequest = {
  follow?: boolean
}
export type RescanResponse = { sequence: number; startedAt: number; endSequence: number }

export const RescanRequestSchema: yup.ObjectSchema<RescanRequest> = yup
  .object({
    follow: yup.boolean().optional(),
  })
  .defined()

export const RescanResponseSchema: yup.ObjectSchema<RescanResponse> = yup
  .object({
    sequence: yup.number().defined(),
    endSequence: yup.number().defined(),
    startedAt: yup.number().defined(),
  })
  .defined()

routes.register<typeof RescanRequestSchema, RescanResponse>(
  `${ApiNamespace.wallet}/rescan`,
  RescanRequestSchema,
  async (request, context): Promise<void> => {
    AssertHasRpcContext(request, context, 'wallet', 'logger')

    while (context.wallet.scanner.running) {
      context.logger.debug('Aborting scanning to start a full wallet rescan.')
      await context.wallet.scanner.abort()
    }

    await context.wallet.resetAccounts()

    const scan = await context.wallet.scan({ force: true, wait: false })

    if (request.data.follow && scan) {
      const onTransaction = (sequence: number, endSequence: number) => {
        request.stream({
          sequence: sequence,
          endSequence: endSequence,
          startedAt: scan.startedAt,
        })
      }

      scan.onTransaction.on(onTransaction)
      await scan.wait()
      scan.onTransaction.off(onTransaction)
    }

    request.end()
  },
)
