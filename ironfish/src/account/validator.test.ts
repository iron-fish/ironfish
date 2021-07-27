/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  isValidIncomingViewKey,
  isValidOutgoingViewKey,
  isValidPublicAddress,
  isValidSpendingKey,
} from './validator'

describe('account-validator tests', () => {
  test('valid public address should return true', () => {
    const VALID_PUBLIC_ADDRESS =
      'e877d6903692094b67d889c483d09ad2f8438efc8f00c82e1ec3b2ccd1798ceca48216546dbae48c685f50'
    expect(isValidPublicAddress(VALID_PUBLIC_ADDRESS)).toBe(true)
  })

  test('public address with non valid character should return false', () => {
    const INVALID_PUBLIC_ADDRESS =
      '#877d6903692094b67d889c483d09ad2f8438efc8f00c82e1ec3b2ccd1798ceca48216546dbae48c685f50'
    expect(isValidPublicAddress(INVALID_PUBLIC_ADDRESS)).toBe(false)
  })

  test('public address with non valid length should return false', () => {
    const INVALID_PUBLIC_ADDRESS =
      'e877d6903692094b67d889c483d09ad2f8438efc8f00c82e1ec3b2ccd1798ceca48216546dbae48c685f5'
    expect(isValidPublicAddress(INVALID_PUBLIC_ADDRESS)).toBe(false)
  })

  test('valid spending key should return true', () => {
    const VALID_SPENDING_KEY =
      'd89e4a60b0b3edb76faeac12d7b88e660afa0b335fbe04b2ddccdf62dff40d89'
    expect(isValidSpendingKey(VALID_SPENDING_KEY)).toBe(true)
  })

  test('spending key with invalid character should return false', () => {
    const INVALID_SPENDING_KEY =
      'd89e4a60b0b3edb76fae c12d7b88e660afa0b335fbe04b2ddccdf62dff40d89'
    expect(isValidSpendingKey(INVALID_SPENDING_KEY)).toBe(false)
  })

  test('spending key with invalid length should return false', () => {
    const INVALID_SPENDING_KEY =
      'd89e4a60b0b3edb76faeac12d7b88e660afa0b335fbe04b2ddccdf62dff40d897'
    expect(isValidSpendingKey(INVALID_SPENDING_KEY)).toBe(false)
  })

  test('valid incoming key should return true', () => {
    const VALID_INCOMING_KEY =
      '01995c33968f4ab3b7e02e173552bbc2817cca8a651f43c382d7bb07546d9c01'
    expect(isValidIncomingViewKey(VALID_INCOMING_KEY)).toBe(true)
  })

  test('incoming key with invalid character should return false', () => {
    const INVALID_INCOMING_KEY =
      '%01995c33968f4ab3b7e02e173552%bc2817cca8a651f43c382d7bb07546d9c01'
    expect(isValidIncomingViewKey(INVALID_INCOMING_KEY)).toBe(false)
  })

  test('incoming key with invalid length should return false', () => {
    const INVALID_INCOMING_KEY =
      '01995c33968f4ab3b7e02e173552bbc2817cca8a651f43c382d7bb07546d9c0'
    expect(isValidIncomingViewKey(INVALID_INCOMING_KEY)).toBe(false)
  })

  test('valid outgoing key should return true', () => {
    const VALID_OUTGOING_KEY =
      '49534715229172ee0b7bc8acde878a4e37380e76688c8d8f0d27141af52c6b27'
    expect(isValidOutgoingViewKey(VALID_OUTGOING_KEY)).toBe(true)
  })

  test('outgoing key with invalid character should return false', () => {
    const INVALID_OUTGOING_KEY =
      '49534715229172ee0b7bc8acde878a4e37380e76&88c8d8f0d27141af52c6b27'
    expect(isValidOutgoingViewKey(INVALID_OUTGOING_KEY)).toBe(false)
  })

  test('outgoing key with invalid length should return false', () => {
    const INVALID_OUTGOING_KEY =
      '49534715229172ee0b7bc8acde878a4e37380e76688c8d8f0d27141af52c6b2dd'
    expect(isValidOutgoingViewKey(INVALID_OUTGOING_KEY)).toBe(false)
  })
})
