/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { SimulationNode } from '../simulation-node'

// This is a utility file for the simulator. It contains functions
// for getting information about accounts, such as their balance and public key.

/**
 *  Gets the balance, in $IRON, of an account on a node.
 */
export async function getAccountBalance(
  node: SimulationNode,
  account: string,
): Promise<number> {
  const resp = await node.client.wallet.getAccountBalance({
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

/**
 * Gets the public key of an account on a node.
 */
export async function getAccountPublicKey(
  node: SimulationNode,
  account: string,
): Promise<string> {
  const resp = await node.client.wallet.getAccountPublicKey({ account })

  const publicKey = resp.content.publicKey
  if (publicKey === undefined) {
    throw new Error(`public key for ${account} is undefined`)
  }

  return publicKey
}

/**
 * Gets the default account on a node.
 */
export async function getDefaultAccount(node: SimulationNode): Promise<string> {
  const resp = await node.client.wallet.getDefaultAccount()

  if (resp.content.account === undefined || resp.content.account?.name === undefined) {
    throw new Error('default account not found')
  }

  return resp.content.account.name
}

/**
 * Imports an account on a node. This is done via `wallet:import`, so the account must be either the
 * copy-pasted output of `wallet:export` or a raw spending key.
 *
 * @param node The node to import the account on
 * @param account The account to import, in the form of a string blob
 * @param rescan Whether to explicitly rescan the blockchain for transactions involving the account
 */
export async function importAccount(
  node: SimulationNode,
  account: string,
  rescan?: boolean,
): Promise<void> {
  await node.executeCliCommandAsync('wallet:import', [account])
  if (rescan) {
    await node.client.wallet.rescanAccountStream().waitForEnd()
  }
}
