/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'

export type GetAccountStatusRequest = {
  stream?: boolean
}
export type GetAccountStatusResponse = {
  sequence: number
  endSequence: number
  startedAt: number
  head: string
}

export const GetAccountStatusRequestSchema: yup.ObjectSchema<GetAccountStatusRequest> = yup
  .object({
    stream: yup.boolean().optional(),
  })
  .defined()

export const GetAccountStatusResponseSchema: yup.ObjectSchema<GetAccountStatusResponse> = yup
  .object({
    sequence: yup.number().defined(),
    endSequence: yup.number().defined(),
    startedAt: yup.number().defined(),
    head: yup.string().defined(),
  })
  .defined()

router.register<typeof GetAccountStatusRequestSchema, GetAccountStatusResponse>(
  `${ApiNamespace.account}/getStatus`,
  GetAccountStatusRequestSchema,
  async (request, node): Promise<void> => {
    const scan = node.accounts.scan

    const accountHeadHash = node.accounts.chainProcessor.hash
      ? node.accounts.chainProcessor.hash
      : node.chain.head.hash

    let accountHeadSequence = node.accounts.chain.head.sequence
    if (accountHeadHash) {
      const header = await node.accounts.chain.getHeader(accountHeadHash)
      accountHeadSequence = header ? header.sequence : accountHeadSequence
    }

    const head = `@ ${accountHeadHash.toString('hex')} (${accountHeadSequence.toString()})`

    if (scan) {
      const onTransaction = (sequence: number, endSequence: number) => {
        if (!request.closed) {
          if (request.data.stream) {
            request.stream({
              sequence: sequence,
              endSequence: endSequence,
              startedAt: scan?.startedAt || 0,
              head,
            })
          } else {
            request.end({
              sequence: sequence,
              endSequence: endSequence,
              startedAt: scan?.startedAt || 0,
              head,
            })
            request.close()
            return
          }
        }
      }

      scan.onTransaction.on(onTransaction)
      request.onClose.on(() => {
        scan?.onTransaction.off(onTransaction)
      })

      await scan.wait()
    }

    request.stream({
      sequence: 0,
      endSequence: -1,
      startedAt: 0,
      head,
    })
    request.end({
      sequence: 0,
      endSequence: -1,
      startedAt: 0,
      head,
    })
  },
)
