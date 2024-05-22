/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Account } from '../account/account'
import { MultisigKeysImport } from '../interfaces/multisigKeys'
import { HeadValue } from '../walletdb/headValue'

export type AccountImport = {
  version: number
  name: string
  spendingKey: string | null
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  createdAt: HeadValue | null
  multisigKeys?: MultisigKeysImport
  proofAuthorizingKey: string | null
}

export function toAccountImport(account: Account, viewOnly: boolean): AccountImport {
  const value = {
    version: account.version,
    name: account.name,
    spendingKey: account.spendingKey,
    viewKey: account.viewKey,
    incomingViewKey: account.incomingViewKey,
    outgoingViewKey: account.outgoingViewKey,
    publicAddress: account.publicAddress,
    createdAt: account.createdAt,
    multisigKeys: account.multisigKeys,
    proofAuthorizingKey: account.proofAuthorizingKey,
  }

  if (viewOnly) {
    value.spendingKey = null

    if (value.multisigKeys) {
      value.multisigKeys = {
        publicKeyPackage: value.multisigKeys.publicKeyPackage,
      }
    }
  }

  return value
}
