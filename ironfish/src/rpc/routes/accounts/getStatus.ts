/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'

export type GetAccountStatusRequest = {
  account?: string
  stream?: boolean
}
export type GetAccountStatusResponse = {
  account: string
  confirmed: string
  unconfirmed: string
  scanStatus: {
    sequence: number
    endSequence: number
    startedAt: number
  }
}

export const GetAccountStatusRequestSchema: yup.ObjectSchema<GetAccountStatusRequest> = yup
  .object({
    account: yup.string().strip(true),
    stream: yup.boolean().optional(),
  })
  .defined()

export const GetAccountStatusResponseSchema: yup.ObjectSchema<GetAccountStatusResponse> = yup
  .object({
    account: yup.string().defined(),
    unconfirmed: yup.string().defined(),
    confirmed: yup.string().defined(),
    scanStatus: yup
      .object({
        sequence: yup.number().defined(),
        endSequence: yup.number().defined(),
        startedAt: yup.number().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof GetAccountStatusRequestSchema, GetAccountStatusResponse>(
  `${ApiNamespace.account}/getStatus`,
  GetAccountStatusRequestSchema,
  async (request, node): Promise<void> => {
    const account = getAccount(node, request.data.account)
    const { confirmed, unconfirmed } = await node.accounts.getBalance(account)

    const scan = node.accounts.scan
    if (scan) {
      const onTransaction = (sequence: number, endSequence: number) => {
        if (!request.closed) {
          if (request.data.stream) {
            request.stream({
              account: account.displayName,
              confirmed: confirmed.toString(),
              unconfirmed: unconfirmed.toString(),
              scanStatus: {
                sequence: sequence,
                endSequence: endSequence,
                startedAt: scan?.startedAt || 0,
              },
            })
          } else {
            request.end({
              account: account.displayName,
              confirmed: confirmed.toString(),
              unconfirmed: unconfirmed.toString(),
              scanStatus: {
                sequence: sequence,
                endSequence: endSequence,
                startedAt: scan?.startedAt || 0,
              },
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

    request.end({
      account: account.displayName,
      confirmed: confirmed.toString(),
      unconfirmed: unconfirmed.toString(),
      scanStatus: {
        sequence: 0,
        endSequence: -1,
        startedAt: 0,
      },
    })
  },
)
