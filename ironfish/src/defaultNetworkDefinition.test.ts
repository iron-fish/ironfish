/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  DEVNET,
  DEVNET_TYPED,
  MAINNET,
  MAINNET_TYPED,
  TESTNET,
  TESTNET_TYPED,
} from './defaultNetworkDefinitions'
import { NetworkDefinition, networkDefinitionSchema } from './networkDefinition'
import { IJSON } from './serde/iJson'

/*
 * These tests validate that typed versions of the default network definitions
 * match the untyped versions.
 * TODO(daniel): Once the untyped versions are removed, we can remove these tests.
 */

describe('Default Network Definitions', () => {
  test.each([
    ['mainnet', MAINNET, MAINNET_TYPED],
    ['testnet', TESTNET, TESTNET_TYPED],
    ['devnet', DEVNET, DEVNET_TYPED],
  ])('matches %s', async (_, raw, typed) => {
    const parsed = await networkDefinitionSchema.validate(IJSON.parse(raw) as NetworkDefinition)

    expect(parsed).toEqual(typed)
    expect(parsed.id).toEqual(typed.id)
    expect(parsed.genesis).toEqual(typed.genesis)
    expect(parsed.bootstrapNodes).toEqual(typed.bootstrapNodes)

    expect(parsed.consensus).toEqual(typed.consensus)

    // Validate header equality
    expect(parsed.genesis.header).toEqual(typed.genesis.header)

    expect(parsed.genesis.header.sequence).toEqual(typed.genesis.header.sequence)
    expect(parsed.genesis.header.previousBlockHash).toEqual(
      typed.genesis.header.previousBlockHash,
    )
    expect(
      parsed.genesis.header.noteCommitment.equals(typed.genesis.header.noteCommitment),
    ).toBe(true)
    expect(parsed.genesis.header.target).toEqual(typed.genesis.header.target)
    expect(parsed.genesis.header.randomness).toEqual(typed.genesis.header.randomness)
    expect(parsed.genesis.header.timestamp).toEqual(typed.genesis.header.timestamp)
    expect(parsed.genesis.header.noteSize).toEqual(typed.genesis.header.noteSize)
    expect(parsed.genesis.header.work).toEqual(typed.genesis.header.work)
    expect(parsed.genesis.header.graffiti).toEqual(typed.genesis.header.graffiti)

    // Validate transaction equality
    expect(parsed.genesis.transactions.length).toEqual(typed.genesis.transactions.length)
    for (const [i, transaction] of parsed.genesis.transactions.entries()) {
      expect(transaction.equals(typed.genesis.transactions[i])).toBe(true)
    }
  })
})
