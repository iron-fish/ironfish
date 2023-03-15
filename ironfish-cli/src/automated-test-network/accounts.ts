/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { SimulationNode } from './simulation-node'

// This is a utility file for the automated simulation network. It contains functions
// for getting information about accounts, such as their balance and public key.

/**
 *  Get the balance, of $IRON, of an account on a node.
 *
 * @param node the node to get the balance from
 * @param account the account to get the balance for
 *
 * @returns the balance in $IRON
 */
export async function getAccountBalance(
  node: SimulationNode,
  account: string,
): Promise<number> {
  const resp = await node.client.getAccountBalance({
    account,
    assetId: Asset.nativeId().toString('hex'),
    confirmations: 0,
  })

  const balance = resp.content.confirmed
  if (balance === undefined) {
    throw new Error(`balance for ${account} is undefined`)
  }

  return parseInt(balance)
}

export async function getAccountPublicKey(
  node: SimulationNode,
  account: string,
): Promise<string> {
  const resp = await node.client.getAccountPublicKey({ account })

  const publicKey = resp.content.publicKey
  if (publicKey === undefined) {
    throw new Error(`public key for ${account} is undefined`)
  }

  return publicKey
}

/**
 * Get the default account on a node.
 */
export async function getDefaultAccount(node: SimulationNode): Promise<string> {
  const resp = await node.client.getDefaultAccount()

  if (resp.content.account === undefined || resp.content.account?.name === undefined) {
    throw new Error('default account not found')
  }

  return resp.content.account.name
}
