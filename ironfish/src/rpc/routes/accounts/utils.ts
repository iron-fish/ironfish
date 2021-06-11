/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ValidationError } from '../../adapters'
import { IronfishNode } from '../../../node'
import { Account } from '../../../account'
import { Event } from '../../../event'
import { RescanAccountResponse } from './rescanAccount'

export function getAccount(node: IronfishNode, name?: string): Account {
  if (name) {
    const account = node.accounts.getAccountByName(name)
    if (account) return account
    throw new ValidationError(`No account with name ${name}`)
  }

  const defaultAccount = node.accounts.getDefaultAccount()
  if (defaultAccount) return defaultAccount

  throw new ValidationError(
    `No account is currently active.\n\n` +
      `Use ironfish accounts:create <name> to first create an account`,
  )
}

export async function runRescan(
  node: IronfishNode,
  follow: boolean,
  reset: boolean,
  stream: (data: RescanAccountResponse) => void,
  onClose?: Event<unknown[]>,
): Promise<void> {
  let scan = node.accounts.getScan()

  if (scan && !follow) {
    throw new ValidationError(`A transaction rescan is already running`)
  }

  if (!scan) {
    if (reset) {
      await node.accounts.reset()
    }
    void node.accounts.scanTransactions()
    scan = node.accounts.getScan()
  }

  if (scan && follow) {
    const onTransaction = (sequence: BigInt) => {
      stream({ sequence: Number(sequence) })
    }

    scan.onTransaction.on(onTransaction)

    if (onClose) {
      onClose.on(() => {
        scan?.onTransaction.off(onTransaction)
      })
    }

    await scan.wait()
  }
}
