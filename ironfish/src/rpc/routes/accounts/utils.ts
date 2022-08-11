/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishNode } from '../../../node'
import { Account } from '../../../wallet'
import { ValidationError } from '../../adapters'

export function getAccount(node: IronfishNode, name?: string): Account {
  if (name) {
    const account = node.accounts.getAccountByName(name)
    if (account) {
      return account
    }
    throw new ValidationError(`No account with name ${name}`)
  }

  const defaultAccount = node.accounts.getDefaultAccount()
  if (defaultAccount) {
    return defaultAccount
  }

  throw new ValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish accounts:create <name> to first create an account`,
  )
}

export async function getTransactionStatus(
  node: IronfishNode,
  blockHash: string | null,
  sequence: number | null,
  expirationSequence: number,
): Promise<string> {
  const headSequence = node.chain.head.sequence

  if (sequence && blockHash) {
    const sequenceHash = await node.chain.getHashAtSequence(sequence)
    if (blockHash === sequenceHash?.toString('hex')) {
      const confirmations = headSequence - sequence
      const minimumBlockConfirmations = node.config.get('minimumBlockConfirmations')
      return confirmations >= minimumBlockConfirmations ? 'completed' : 'confirming'
    } else {
      return 'forked'
    }
  } else {
    return headSequence > expirationSequence ? 'expired' : 'pending'
  }
}
