/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Address, bytesToHex, hexToBytes } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { FullNode } from '../../../node'
import { registerEthRoute } from '../eth/ethRouter'
import { ApiNamespace } from '../namespaces'

export type SignTransactionRequest = {
  from: string
  to?: string
  gas?: string
  gasPrice?: string
  value?: string
  data?: string
  nonce?: string
}

export const SignTransactionRequestSchema: yup.ArraySchema<SignTransactionRequest> = yup
  .array()
  .of(
    yup
      .object()
      .shape({
        from: yup.string().defined(),
        to: yup.string().optional(),
        gas: yup.string().optional(),
        gasPrice: yup.string().optional(),
        value: yup.string().optional(),
        data: yup.string().optional(),
        nonce: yup.string().optional(),
      })
      .required(),
  )
  .required()

export type SignTransactionResponse = string

export const SignTransactionResponseSchema: yup.StringSchema<SignTransactionResponse> = yup
  .string()
  .defined()

registerEthRoute<typeof SignTransactionRequestSchema, SignTransactionResponse>(
  `eth_signTransaction`,
  `${ApiNamespace.eth}/signTransaction`,
  SignTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const [transaction] = request.data
    const { from, to, gas, gasPrice, value, data, nonce } = transaction

    // Fetch the private key for the 'from' address
    const accounts = node.wallet.listAccounts()
    const account = accounts
      .filter((a) => a.spendingKey !== undefined)
      .find((a) => a.ethAddress === from)

    if (!account) {
      throw new Error(`Account not found for address ${from}`)
    }

    const ethAccount = await node.chain.blockchainDb.stateManager.getAccount(
      Address.fromPrivateKey(Buffer.from(account.spendingKey!, 'hex')),
    )

    const nonceTx = nonce ?? (ethAccount ? ethAccount.nonce : 0)

    const tx = new LegacyTransaction({
      nonce: nonceTx,
      gasLimit: gas,
      gasPrice: gasPrice,
      to: to ? Address.fromString(to) : undefined,
      value: value,
      data: data ? hexToBytes(data) : undefined,
    })

    const signedTx = tx.sign(Buffer.from(account.spendingKey!, 'hex'))

    request.end(bytesToHex(signedTx.serialize()))
  },
)
