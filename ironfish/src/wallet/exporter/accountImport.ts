/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { generatePublicAddressFromIncomingViewKey } from '@ironfish/rust-nodejs'
import { Account } from '../account/account'
import {
  isValidIncomingViewKey,
  isValidIVKAndPublicAddressPair,
  isValidOutgoingViewKey,
  isValidPublicAddress,
  isValidSpendingKey,
  isValidViewKey,
} from '../validator'
import { isSignerMultisig } from '../walletdb/multisigKeys'
import { MultisigKeysImport } from './multisig'

export type AccountImport = {
  version: number
  name: string
  spendingKey: string | null
  viewKey: string
  incomingViewKey: string
  outgoingViewKey: string
  publicAddress: string
  createdAt: {
    hash: Buffer
    sequence: number
    networkId?: number
  } | null
  multisigKeys?: MultisigKeysImport
  proofAuthorizingKey: string | null
  ledger: boolean
}

export function toAccountImport(
  account: Account,
  viewOnly: boolean,
  networkId: number,
): AccountImport {
  const createdAt = account.createdAt
    ? {
        ...account.createdAt,
        networkId,
      }
    : null

  const value = {
    version: account.version,
    name: account.name,
    spendingKey: account.spendingKey,
    viewKey: account.viewKey,
    incomingViewKey: account.incomingViewKey,
    outgoingViewKey: account.outgoingViewKey,
    publicAddress: account.publicAddress,
    createdAt,
    multisigKeys: account.multisigKeys,
    proofAuthorizingKey: account.proofAuthorizingKey,
    ledger: account.ledger,
  }

  if (viewOnly) {
    value.spendingKey = null

    if (value.multisigKeys && isSignerMultisig(value.multisigKeys)) {
      value.multisigKeys = {
        publicKeyPackage: value.multisigKeys.publicKeyPackage,
      }
    }
  }

  return value
}

export function validateAccountImport(toImport: AccountImport): void {
  if (!toImport.name) {
    throw new Error(`Imported account has no name`)
  }

  if (!toImport.publicAddress) {
    throw new Error(`Imported account has no public address`)
  }

  if (!isValidPublicAddress(toImport.publicAddress)) {
    throw new Error(`Provided public address ${toImport.publicAddress} is invalid`)
  }

  if (!toImport.outgoingViewKey) {
    throw new Error(`Imported account has no outgoing view key`)
  }

  if (!isValidOutgoingViewKey(toImport.outgoingViewKey)) {
    throw new Error(`Provided outgoing view key ${toImport.outgoingViewKey} is invalid`)
  }

  if (!toImport.incomingViewKey) {
    throw new Error(`Imported account has no incoming view key`)
  }

  if (!isValidIncomingViewKey(toImport.incomingViewKey)) {
    throw new Error(`Provided incoming view key ${toImport.incomingViewKey} is invalid`)
  }

  if (!toImport.viewKey) {
    throw new Error(`Imported account has no view key`)
  }

  if (!isValidViewKey(toImport.viewKey)) {
    throw new Error(`Provided view key ${toImport.viewKey} is invalid`)
  }

  if (toImport.spendingKey && !isValidSpendingKey(toImport.spendingKey)) {
    throw new Error(`Provided spending key ${toImport.spendingKey} is invalid`)
  }

  if (!isValidIVKAndPublicAddressPair(toImport.incomingViewKey, toImport.publicAddress)) {
    const generatedPublicAddress = generatePublicAddressFromIncomingViewKey(
      toImport.incomingViewKey,
    )
    throw new Error(
      `Public address ${toImport.publicAddress} does not match public address generated from incoming view key ${generatedPublicAddress}`,
    )
  }
}
