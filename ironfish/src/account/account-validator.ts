/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const PUBLIC_ADDRESS_LENGTH = 86
const SPENDING_KEY_LENGTH = 64
const INCOMING_VIEW_KEY_LENGTH = 64
const OUTGOING_VIEW_KEY_LENGTH = 64

export function isValidPublicAddress(publicAddress: string): boolean {
  return publicAddress.length === PUBLIC_ADDRESS_LENGTH && haveAllowedCharacters(publicAddress)
}

export function isValidSpendingKey(spendingKey: string): boolean {
  return spendingKey.length === SPENDING_KEY_LENGTH && haveAllowedCharacters(spendingKey)
}

export function isValidIncomingViewKey(incomingViewKey: string): boolean {
  return (
    incomingViewKey.length === INCOMING_VIEW_KEY_LENGTH &&
    haveAllowedCharacters(incomingViewKey)
  )
}

export function isValidOutgoingViewKey(outgoingViewKey: string): boolean {
  return (
    outgoingViewKey.length === OUTGOING_VIEW_KEY_LENGTH &&
    haveAllowedCharacters(outgoingViewKey)
  )
}

function haveAllowedCharacters(text: string): boolean {
  const validInputRegex = /^[0-9a-z]+$/
  return validInputRegex.exec(text) != null
}
