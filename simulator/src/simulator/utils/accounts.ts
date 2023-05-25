/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SimulationNode } from '../simulation-node'

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
  await node.executeCliCommandWithExec('wallet:import', [account])

  if (rescan) {
    await node.client.wallet.rescanAccountStream().waitForEnd()
  }
}
