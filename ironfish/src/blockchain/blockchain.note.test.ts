/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RangeHasher } from '../merkletree'
import {
  makeChainInitial,
  makeNullifier,
  TestStrategy,
  TestBlockchain,
} from '../captain/testUtilities'
import { Target } from './target'

describe('Note adding', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  let targetSpy: jest.SpyInstance
  beforeEach(async () => {
    targetSpy = jest.spyOn(Target, 'minDifficulty').mockReturnValue(BigInt(1))
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onChainHeadChange.on(listener)
  })

  afterAll(() => [targetSpy.mockClear()])

  it('immediately adds in order notes to the tree', async () => {
    await blockchain.addNote(0, 'zero')
    await blockchain.addNote(1, 'one')
    expect(blockchain.looseNotes[0]).toBe('zero')
    expect(blockchain.looseNotes[1]).toBe('one')
    expect(await blockchain.notes.size()).toBe(2)
    expect(await blockchain.notes.get(0)).toBe('zero')
    expect(await blockchain.notes.get(1)).toBe('one')
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it('adds an out of order note only to the loose notes', async () => {
    await blockchain.addNote(10, 'ten')
    await blockchain.addNote(11, 'eleven')
    await blockchain.addNote(12, 'twelve')
    expect(blockchain.looseNotes[10]).toBe('ten')
    expect(blockchain.looseNotes[11]).toBe('eleven')
    expect(blockchain.looseNotes[12]).toBe('twelve')
    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it('syncs loose notes to the tree when the gap fills in', async () => {
    await blockchain.addNote(2, 'two')
    await blockchain.addNote(1, 'one')
    await blockchain.addNote(0, 'zero')
    expect(blockchain.looseNotes[0]).toBe('zero')
    expect(blockchain.looseNotes[1]).toBe('one')
    expect(blockchain.looseNotes[2]).toBe('two')
    expect(await blockchain.notes.size()).toBe(3)
    expect(await blockchain.notes.get(0)).toBe('zero')
    expect(await blockchain.notes.get(1)).toBe('one')
    expect(await blockchain.notes.get(2)).toBe('two')
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it("warns if the note doesn't match the previously inserted note that position", async () => {
    const warnFn = jest.fn()
    blockchain['logger'].mockTypes((type) => {
      return type === 'warn' ? warnFn : () => {}
    })
    await blockchain.addNote(0, 'zero')
    await blockchain.addNote(1, 'one')
    await blockchain.addNote(2, 'two')
    await blockchain.addNote(2, 'not two')
    expect(warnFn).toHaveBeenCalled()
  })
})

describe('Nullifier adding', () => {
  const strategy = new TestStrategy(new RangeHasher())
  let blockchain: TestBlockchain
  let listener: jest.Mock
  beforeEach(async () => {
    blockchain = await makeChainInitial(strategy)
    listener = jest.fn()
    blockchain.onChainHeadChange.on(listener)
  })

  it('immediately adds in order nullifiers to the tree', async () => {
    const nullifier1 = Buffer.alloc(32)
    const nullifier2 = makeNullifier(1)
    await blockchain.addNullifier(0, nullifier1)
    await blockchain.addNullifier(1, nullifier2)
    expect(blockchain.looseNullifiers[0]).toEqualNullifier(nullifier1)
    expect(blockchain.looseNullifiers[1]).toEqualNullifier(nullifier2)
    expect(await blockchain.nullifiers.size()).toBe(2)
    expect(await blockchain.nullifiers.get(0)).toEqualNullifier(nullifier1)
    expect(await blockchain.nullifiers.get(1)).toEqualNullifier(nullifier2)
    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it('adds an out of order nullifier only to the loose nullifiers', async () => {
    const nullifier1 = makeNullifier(10)
    const nullifier2 = makeNullifier(11)
    const nullifier3 = makeNullifier(12)
    await blockchain.addNullifier(10, nullifier1)
    await blockchain.addNullifier(11, nullifier2)
    await blockchain.addNullifier(12, nullifier3)
    expect(blockchain.looseNullifiers[10]).toEqualNullifier(nullifier1)
    expect(blockchain.looseNullifiers[11]).toEqualNullifier(nullifier2)
    expect(blockchain.looseNullifiers[12]).toEqualNullifier(nullifier3)
    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.nullifiers.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it('syncs loose nullifiers to the tree when the gap fills in', async () => {
    const nullifier0 = Buffer.alloc(32)
    const nullifier1 = makeNullifier(1)
    const nullifier2 = makeNullifier(2)
    await blockchain.addNullifier(2, nullifier2)
    await blockchain.addNullifier(1, nullifier1)
    await blockchain.addNullifier(0, nullifier0)
    expect(blockchain.looseNullifiers[0]).toEqualNullifier(nullifier0)
    expect(blockchain.looseNullifiers[1]).toEqualNullifier(nullifier1)
    expect(blockchain.looseNullifiers[2]).toEqualNullifier(nullifier2)
    expect(await blockchain.nullifiers.size()).toBe(3)
    expect(await blockchain.nullifiers.get(0)).toEqualNullifier(nullifier0)
    expect(await blockchain.nullifiers.get(1)).toEqualNullifier(nullifier1)
    expect(await blockchain.nullifiers.get(2)).toEqualNullifier(nullifier2)
    expect(await blockchain.notes.size()).toBe(0)
    expect(await blockchain.getHeaviestHead()).toBeNull()
    expect(listener).not.toBeCalled()
  })
  it("warns if the note doesn't match the previously inserted note that position", async () => {
    const warnFn = jest.fn()
    blockchain['logger'].mockTypes((type) => {
      return type === 'warn' ? warnFn : () => {}
    })
    const nullifier0 = Buffer.alloc(32)
    const nullifier1 = makeNullifier(1)
    const nullifier2 = makeNullifier(2)
    await blockchain.addNullifier(0, nullifier0)
    await blockchain.addNullifier(1, nullifier1)
    await blockchain.addNullifier(2, nullifier2)
    await blockchain.addNullifier(2, nullifier0)
    expect(warnFn).toHaveBeenCalled()
  })

  it('sixNullifierRoot matches expected rootHash', async () => {
    await blockchain.addNullifier(0, makeNullifier(0))
    await blockchain.addNullifier(1, makeNullifier(1))
    await blockchain.addNullifier(2, makeNullifier(2))
    await blockchain.addNullifier(3, makeNullifier(3))
    await blockchain.addNullifier(4, makeNullifier(4))
    await blockchain.addNullifier(5, makeNullifier(5))
    const rootHash = await blockchain.nullifiers.rootHash()
    expect(rootHash.equals(sixNullifierRoot)).toBeTruthy()
  })
})

const sixNullifierRoot = Buffer.from([
  225,
  164,
  205,
  91,
  37,
  68,
  206,
  32,
  128,
  69,
  41,
  50,
  240,
  78,
  211,
  128,
  227,
  49,
  167,
  139,
  132,
  31,
  71,
  88,
  44,
  71,
  19,
  28,
  204,
  126,
  14,
  152,
])
