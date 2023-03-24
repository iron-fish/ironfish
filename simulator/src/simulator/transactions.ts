/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { SendTransactionResponse } from '@ironfish/sdk'
import { getAccountPublicKey, getDefaultAccount } from './accounts'
import { SimulationNode } from './simulation-node'

/**
 * Sends a transaction from one node to another using the sendTransaction RPC call.
 * Currently, it will use the default accounts on each node.
 *
 * Specifying specific accounts will be supported in the future.
 */
export async function sendTransaction(
  from: SimulationNode,
  to: SimulationNode,
  fee: number,
  amount: number,
  memo?: string,
  assetId?: string,
  options?: {
    expiration?: number | null
    expirationDelta?: number | null
    confirmations?: number | null
  },
): Promise<SendTransactionResponse> {
  const fromAccount = await getDefaultAccount(from)
  const toAccount = await getDefaultAccount(to)

  const toPublicKey = await getAccountPublicKey(to, toAccount)
  if (!isValidPublicAddress(toPublicKey)) {
    throw new Error('invalid public key for to account')
  }

  const txn = await from.client.sendTransaction({
    account: fromAccount,
    outputs: [
      {
        publicAddress: toPublicKey,
        amount: amount.toString(),
        memo: memo || 'default memo',
        assetId: assetId || Asset.nativeId().toString('hex'),
      },
    ],
    fee: BigInt(fee).toString(),
    ...options,
  })

  return txn.content
}
