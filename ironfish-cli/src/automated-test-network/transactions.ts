/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, isValidPublicAddress } from '@ironfish/rust-nodejs'
import { getAccountPublicKey, getDefaultAccount } from './accounts'
import { SimulationNode } from './simulation-node'

/**
 * Utility function for sending a transaction from one node to another.
 * Currently, it will use the default accounts on each node.
 *
 * Specifying specific accounts will be supported in the future.
 */
export async function sendTransaction(
  from: SimulationNode,
  to: SimulationNode,
  config: { spendLimit: number; fee: number; spendType: 'flat' | 'random' },
): Promise<{ amount: number; hash: string }> {
  const spendAmount = Math.round(
    config.spendType === 'flat' ? config.spendLimit : Math.random() * config.spendLimit,
  )

  const fromAccount = await getDefaultAccount(from)
  const toAccount = await getDefaultAccount(to)

  if (!fromAccount || !toAccount) {
    throw new Error('missing account')
  }

  const toPublicKey = await getAccountPublicKey(to, toAccount)
  if (!isValidPublicAddress(toPublicKey)) {
    throw new Error('invalid public key')
  }

  const startTime = performance.now()
  const txn = await from.client.sendTransaction({
    account: fromAccount,
    outputs: [
      {
        publicAddress: toPublicKey,
        amount: spendAmount.toString(),
        memo: 'lol',
        assetId: Asset.nativeId().toString('hex'),
      },
    ],
    fee: BigInt(config.fee).toString(),
  })
  const endTime = performance.now()

  console.log(`Timer: client send - ${(endTime - startTime) / 1000}s`)

  const hash = txn.content.hash

  return { amount: spendAmount, hash }
}
