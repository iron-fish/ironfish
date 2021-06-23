/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account } from '../../../account'
import { IronfishNode } from '../../../node'
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
