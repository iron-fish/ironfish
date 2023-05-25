/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { Transaction } from '@ironfish/sdk'
import { SimulationNode } from '../simulation-node'

/**
 * Gets the default account on a node.
 */
async function getDefaultAccount(node: SimulationNode): Promise<string> {
  const resp = await node.client.wallet.getDefaultAccount()

  if (resp.content.account === undefined || resp.content.account?.name === undefined) {
    throw new Error('default account not found')
  }

  return resp.content.account.name
}

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
): Promise<{ transaction: Transaction; hash: string }> {
  const fromAccount = await getDefaultAccount(from)
  const toAccount = await getDefaultAccount(to)

  const resp = await to.client.wallet.getAccountPublicKey({ account: toAccount })

  const toPublicKey = resp.content.publicKey
  if (toPublicKey === undefined) {
    throw new Error(`public key for ${toAccount} is undefined`)
  }

  if (!isValidPublicAddress(toPublicKey)) {
    throw new Error('invalid public key for to account')
  }

  const txn = await from.client.wallet.sendTransaction({
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

  const transaction = new Transaction(Buffer.from(txn.content.transaction, 'hex'))
  return {
    transaction,
    hash: txn.content.hash,
  }
}
