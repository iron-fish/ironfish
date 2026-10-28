/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateKey } from '@ironfish/rust-nodejs'
import { Assert } from '../assert'
import { VerificationResultReason } from '../consensus/verifier'
import { DEV_GENESIS_ACCOUNT } from '../networks/definitions/devnet'
import { RawTransaction } from '../primitives/rawTransaction'
import { TransactionVersion } from '../primitives/transaction'
import { createNodeTest } from '../testUtilities/nodeTest'
import { Side } from './merkletree'
import { NoteWitness, Witness } from './witness'

// Reconstruct the historical self-copy rule independently of MerkleTree.
function legacyWitness(
  hashes: Buffer[],
  position: number,
  size: number,
  tree: {
    hasher: NoteWitness['merkleHasher']
    depth: number
  },
): NoteWitness {
  let layer = hashes
  let cursor = position
  const path: NoteWitness['authenticationPath'] = []
  for (let depth = 0; depth < tree.depth; depth++) {
    const sibling = layer[cursor ^ 1] ?? layer[cursor]
    path.push({ side: cursor % 2 ? Side.Right : Side.Left, hashOfSibling: sibling })
    const next: Buffer[] = []
    for (let index = 0; index < layer.length; index += 2) {
      next.push(tree.hasher.combineHash(depth, layer[index], layer[index + 1] ?? layer[index]))
    }
    layer = next
    cursor = Math.floor(cursor / 2)
  }
  return new Witness(size, layer[0], path, tree.hasher)
}

describe('spend proof against copied Merkle branches', () => {
  const nodeTest = createNodeTest()

  it('accepts two old-rule proofs with distinct nullifiers but rejects their anchor in consensus', async () => {
    const key = generateKey()
    const chain = nodeTest.chain
    const minersFee = await chain.createMinersFee(0n, chain.head.sequence + 1, key.spendingKey)
    const block = await chain.newBlock([], minersFee)
    await expect(chain).toAddBlock(block)

    const note = minersFee.notes[0].decryptNoteForOwner(key.incomingViewKey)
    Assert.isNotUndefined(note)
    expect(note.value()).toBeGreaterThan(0n)
    const size = await chain.notes.size()
    const position = size - 1
    // The new block's miner note is the last leaf. Reconstruct the old root
    // from all public commitments using a separate layer-by-layer algorithm.
    const hashes: Buffer[] = []
    for (let i = 0; i < size; i++) {
      hashes.push((await chain.notes.getLeaf(i)).merkleHash)
    }
    expect(hashes[position]).toEqual(note.hash())
    const old = legacyWitness(hashes, position, size, chain.notes)
    const aliasPath = old.authenticationPath.map((node) => ({ ...node }))
    aliasPath[31].side = Side.Right
    const alias = new Witness(size, old.rootHash, aliasPath, chain.notes.hasher)
    expect(old.verify(note.hash())).toBe(true)
    expect(alias.verify(note.hash())).toBe(true)
    expect(old.rootHash).not.toEqual(await chain.notes.rootHash())

    const createSpend = (witness: NoteWitness) => {
      const raw = new RawTransaction(minersFee.version())
      raw.spends.push({ note, witness })
      raw.fee = 1n
      return raw.post(key.spendingKey)
    }
    const first = createSpend(old)
    const second = createSpend(alias)
    expect(first.spends[0].nullifier).not.toEqual(second.spends[0].nullifier)
    expect(await nodeTest.workerPool.verifyTransactions([first, second])).toEqual({
      valid: true,
    })
    for (const transaction of [first, second]) {
      expect(await nodeTest.verifier.verifyTransactionSpends(transaction)).toEqual({
        valid: false,
        reason: VerificationResultReason.INVALID_SPEND,
      })
    }

    const real = await chain.notes.witness(position)
    Assert.isNotNull(real)
    const honest = createSpend(real)
    expect(await nodeTest.workerPool.verifyTransactions([honest])).toEqual({ valid: true })
    expect(await nodeTest.verifier.verifyTransactionSpends(honest)).toEqual({ valid: true })
  }, 120000)

  it('spends the regenerated genesis allocation in a V1 devnet block', async () => {
    const chain = nodeTest.chain
    expect(await chain.notes.size()).toBe(3)
    expect(chain.consensus.getActiveTransactionVersion(2)).toBe(TransactionVersion.V1)

    const genesis = await chain.getBlock(chain.genesis.hash)
    Assert.isNotNull(genesis)
    const note = genesis.transactions[2].notes[0].decryptNoteForOwner(
      DEV_GENESIS_ACCOUNT.incomingViewKey,
    )
    Assert.isNotUndefined(note)
    expect(note.value()).toBe(4200000000000000n)

    const witness = await chain.notes.witness(2)
    Assert.isNotNull(witness)
    expect(witness.verify(note.hash())).toBe(true)

    const raw = new RawTransaction(TransactionVersion.V1)
    raw.spends.push({ note, witness })
    raw.fee = 1n
    const spend = raw.post(DEV_GENESIS_ACCOUNT.spendingKey)
    expect(await nodeTest.workerPool.verifyTransactions([spend])).toEqual({ valid: true })
    expect(await nodeTest.verifier.verifyTransactionSpends(spend)).toEqual({ valid: true })

    const minersFee = await chain.createMinersFee(1n, 2, generateKey().spendingKey)
    const block = await chain.newBlock([spend], minersFee)
    await expect(chain).toAddBlock(block)
  }, 120000)
})
