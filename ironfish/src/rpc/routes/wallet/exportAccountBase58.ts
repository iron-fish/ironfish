/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ApiNamespace, router } from '../router'
import { getAccount } from './utils'
import bs58safe from 'bs58check-ts'

export type ExportAccountBase58Request = { account?: string }
export type ExportAccountBase58Response = {
  account: {
    name: string
    spendingKey: string
    incomingViewKey: string
    outgoingViewKey: string
    publicAddress: string
  }
}

export const ExportAccountRequestBase58Schema: yup.ObjectSchema<ExportAccountBase58Request> = yup
  .object({
    account: yup.string().strip(true),
  })
  .defined()

export const ExportAccountResponseBase58Schema: yup.ObjectSchema<ExportAccountBase58Response> = yup
  .object({
    account: yup
      .object({
        name: yup.string().defined(),
        spendingKey: yup.string().defined(),
        incomingViewKey: yup.string().defined(),
        outgoingViewKey: yup.string().defined(),
        publicAddress: yup.string().defined(),
      })
      .defined(),
  })
  .defined()

router.register<typeof ExportAccountRequestBase58Schema, ExportAccountBase58Response>(
  `${ApiNamespace.wallet}/exportAccountBase58`,
  ExportAccountRequestBase58Schema,
  (request, node): void => {
    const account = getAccount(node, request.data.account).serialize()
    account.spendingKey = bs58safe.encode(
      Buffer.from(account.spendingKey, 'hex'),
    )
    account.incomingViewKey = bs58safe.encode(
      Buffer.from(account.incomingViewKey, 'hex'),
    )
    account.outgoingViewKey = bs58safe.encode(
      Buffer.from(account.outgoingViewKey, 'hex'),
    )
    request.end({ account: account })
  },
)
