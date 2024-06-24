/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  generatePublicAddressFromIncomingViewKey,
  isValidPublicAddress as nativeIsValidPublicAddress,
} from '@ironfish/rust-nodejs'

const SPENDING_KEY_LENGTH = 64
const INCOMING_VIEW_KEY_LENGTH = 64
const OUTGOING_VIEW_KEY_LENGTH = 64
const VIEW_KEY_LENGTH = 128

export function isValidPublicAddress(publicAddress: string): boolean {
  return nativeIsValidPublicAddress(publicAddress)
}

export function isValidSpendingKey(spendingKey: string): boolean {
  return spendingKey.length === SPENDING_KEY_LENGTH && isHexEncoding(spendingKey)
}

export function isValidIncomingViewKey(incomingViewKey: string): boolean {
  return incomingViewKey.length === INCOMING_VIEW_KEY_LENGTH && isHexEncoding(incomingViewKey)
}

export function isValidOutgoingViewKey(outgoingViewKey: string): boolean {
  return outgoingViewKey.length === OUTGOING_VIEW_KEY_LENGTH && isHexEncoding(outgoingViewKey)
}

export function isValidIVKAndPublicAddressPair(ivk: string, publicAddress: string): boolean {
  return generatePublicAddressFromIncomingViewKey(ivk) === publicAddress
}

export function isValidViewKey(viewKey: string): boolean {
  return viewKey.length === VIEW_KEY_LENGTH && isHexEncoding(viewKey)
}

function isHexEncoding(text: string): boolean {
  const validInputRegex = /^[0-9a-f]+$/
  return validInputRegex.exec(text.toLowerCase()) != null
}
