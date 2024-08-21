/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Address } from '@ethereumjs/util'
import * as yup from 'yup'
import { Assert } from '../../../assert'
import { GLOBAL_IF_ACCOUNT } from '../../../evm'
import { FullNode } from '../../../node'
import { legacyTransactionToEvmDescription } from '../../../primitives'
import { EthUtils } from '../../../utils/eth'
import { AssertSpending } from '../../../wallet/account/account'
import { ApiNamespace } from '../namespaces'
import { registerEthRoute } from './ethRouter'

export type EthSendTransactionRequest = {
  from: string
  to?: string
  gas?: string
  gasPrice?: string
  value?: string
  data?: string
  nonce?: string
}

export type EthSendTransactionResponse = {
  result: string
}

export const EthSendTransactionRequestSchema: yup.ObjectSchema<EthSendTransactionRequest> = yup
  .object({
    from: yup.string().defined(),
    to: yup.string().optional(),
    gas: yup.string().optional(),
    gasPrice: yup.string().optional(),
    value: yup.string().optional(),
    data: yup.string().optional(),
    nonce: yup.string().optional(),
  })
  .defined()

export const EthSendTransactionResponseSchema: yup.ObjectSchema<EthSendTransactionResponse> =
  yup
    .object({
      result: yup.string().defined(),
    })
    .defined()

registerEthRoute<typeof EthSendTransactionRequestSchema, EthSendTransactionResponse>(
  'eth_sendTransaction',
  `${ApiNamespace.eth}/sendTransaction`,
  EthSendTransactionRequestSchema,
  async (request, node): Promise<void> => {
    Assert.isInstanceOf(node, FullNode)

    const account = node.wallet.listAccounts().find((a) => a.ethAddress === request.data.from)
    Assert.isNotUndefined(account, 'Account not found')
    AssertSpending(account)

    const ethAccount = account.ethAddress
      ? await node.chain.evm.getAccount(
          Address.fromString(EthUtils.prefix0x(account.ethAddress)),
        )
      : undefined

    const nonce = request.data.nonce
      ? BigInt(request.data.nonce)
      : ethAccount?.nonce ?? BigInt(0)

    const gas = request.data.gas ? BigInt(request.data.gas) : 1000000n
    const gasPrice = request.data.gasPrice ? BigInt(request.data.gasPrice) : 0n
    const value = request.data.value ? BigInt(request.data.value) : undefined

    const ethTransaction = new LegacyTransaction({
      nonce: nonce,
      to: request.data.to,
      gasLimit: gas,
      gasPrice: gasPrice,
      value: value,
      data: request.data.data,
    })

    const signed = ethTransaction.sign(Buffer.from(account.spendingKey, 'hex'))

    const evmDescription = legacyTransactionToEvmDescription(signed)
    const result = await node.chain.evm.simulateTx({ tx: signed })

    const events = result.events
    Assert.isUndefined(result.error, `Error simulating transaction ${result.error?.message}`)

    const raw = await node.wallet.createEvmTransaction({
      evm: evmDescription,
      evmEvents: events,
      account: account,
    })

    // TODO: This is pretty hacky to figure out which key to post with
    const unshields = events ? events.filter((e) => e.name === 'unshield') : []
    const spendingKey =
      unshields.length > 0 ? account.spendingKey : GLOBAL_IF_ACCOUNT.spendingKey

    const { transaction } = await node.wallet.post({
      transaction: raw,
      spendingKey: spendingKey,
    })

    request.end({
      result: Buffer.from(transaction.hash()).toString('hex'),
    })
  },
)
