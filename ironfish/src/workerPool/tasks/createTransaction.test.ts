/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Note, TransactionPosted } from 'ironfish-rust-nodejs'
import { NoteWitness } from '../../merkletree/witness'
import { createNodeTest, useAccountFixture, useMinerBlockFixture } from '../../testUtilities'
import {
  BinaryCreateTransactionRequest,
  BinaryCreateTransactionResponse,
  CreateTransactionRequest,
  handleCreateTransaction,
} from './createTransaction'

describe('CreateTransaction', () => {
  const nodeTest = createNodeTest()

  it('properly serializes request', async () => {
    const nodeA = nodeTest.node
    const accountA = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testB'),
    )

    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.accounts.updateHead()

    const transactionFee = BigInt(1)
    const expirationSequence = 0
    const receives = [
      {
        publicAddress: accountB.publicAddress,
        amount: BigInt(1),
        memo: '',
      },
    ]
    let amountNeeded =
      receives.reduce((acc, receive) => acc + receive.amount, BigInt(0)) + transactionFee
    const notesToSpend: Array<{ note: Note; witness: NoteWitness }> = []
    const unspentNotes = await nodeA.accounts['getUnspentNotes'](accountA)

    for (const unspentNote of unspentNotes) {
      // Skip unconfirmed notes
      if (unspentNote.index === null) {
        continue
      }

      if (unspentNote.note.value() > BigInt(0)) {
        // Double-check that the nullifier for the note isn't in the tree already
        // This would indicate a bug in the account transaction stores
        const nullifier = Buffer.from(
          unspentNote.note.nullifier(accountA.spendingKey, BigInt(unspentNote.index)),
        )

        if (await nodeA.chain.nullifiers.contains(nullifier)) {
          const noteMapValue = nodeA.accounts['noteToNullifier'].get(nullifier.toString('hex'))
          if (noteMapValue) {
            await nodeA.accounts['updateNoteToNullifierMap'](nullifier.toString('hex'), {
              ...noteMapValue,
              spent: true,
            })
          }

          continue
        }

        // Try creating a witness from the note
        const witness = await nodeA.chain.notes.witness(unspentNote.index)

        if (witness === null) {
          continue
        }

        notesToSpend.push({ note: unspentNote.note, witness: witness })
        amountNeeded -= unspentNote.note.value()
      }

      if (amountNeeded <= 0) {
        break
      }
    }

    if (amountNeeded > 0) {
      throw new Error('Insufficient funds')
    }

    const spends = notesToSpend.map((n) => ({
      note: n.note.serialize(),
      treeSize: n.witness.treeSize(),
      authPath: n.witness.authenticationPath,
      rootHash: n.witness.rootHash,
    }))

    const request: CreateTransactionRequest = {
      type: 'createTransaction',
      spendKey: accountA.spendingKey,
      transactionFee,
      expirationSequence,
      spends,
      receives,
    }

    const serializedRequest = BinaryCreateTransactionRequest.serialize(request)
    const createTransaction = new BinaryCreateTransactionRequest(serializedRequest)

    expect(createTransaction.spendKey()).toEqual(accountA.spendingKey)
    expect(createTransaction.transactionFee()).toEqual(transactionFee)
    expect(createTransaction.expirationSequence()).toEqual(expirationSequence)
    expect(createTransaction.spendsReceives()).toEqual({ spends, receives })
  })

  it('properly deserializes response', async () => {
    const nodeA = nodeTest.node
    const accountA = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testA'),
    )
    const accountB = await useAccountFixture(nodeA.accounts, () =>
      nodeA.accounts.createAccount('testB'),
    )

    const block1 = await useMinerBlockFixture(nodeA.chain, 2, accountA)
    await nodeA.chain.addBlock(block1)
    await nodeA.accounts.updateHead()

    const transactionFee = BigInt(1)
    const expirationSequence = 0
    const receives = [
      {
        publicAddress: accountB.publicAddress,
        amount: BigInt(1),
        memo: '',
      },
    ]
    let amountNeeded =
      receives.reduce((acc, receive) => acc + receive.amount, BigInt(0)) + transactionFee
    const notesToSpend: Array<{ note: Note; witness: NoteWitness }> = []
    const unspentNotes = await nodeA.accounts['getUnspentNotes'](accountA)

    for (const unspentNote of unspentNotes) {
      // Skip unconfirmed notes
      if (unspentNote.index === null) {
        continue
      }

      if (unspentNote.note.value() > BigInt(0)) {
        // Double-check that the nullifier for the note isn't in the tree already
        // This would indicate a bug in the account transaction stores
        const nullifier = Buffer.from(
          unspentNote.note.nullifier(accountA.spendingKey, BigInt(unspentNote.index)),
        )

        if (await nodeA.chain.nullifiers.contains(nullifier)) {
          const noteMapValue = nodeA.accounts['noteToNullifier'].get(nullifier.toString('hex'))
          if (noteMapValue) {
            await nodeA.accounts['updateNoteToNullifierMap'](nullifier.toString('hex'), {
              ...noteMapValue,
              spent: true,
            })
          }

          continue
        }

        // Try creating a witness from the note
        const witness = await nodeA.chain.notes.witness(unspentNote.index)

        if (witness === null) {
          continue
        }

        notesToSpend.push({ note: unspentNote.note, witness: witness })
        amountNeeded -= unspentNote.note.value()
      }

      if (amountNeeded <= 0) {
        break
      }
    }

    if (amountNeeded > 0) {
      throw new Error('Insufficient funds')
    }

    const spends = notesToSpend.map((n) => ({
      note: n.note.serialize(),
      treeSize: n.witness.treeSize(),
      authPath: n.witness.authenticationPath,
      rootHash: n.witness.rootHash,
    }))

    const request: CreateTransactionRequest = {
      type: 'createTransaction',
      spendKey: accountA.spendingKey,
      transactionFee,
      expirationSequence,
      spends,
      receives,
    }

    const { responseType, response: serializedResponse } = handleCreateTransaction(
      BinaryCreateTransactionRequest.serialize(request),
    )
    expect(responseType).toEqual('createTransaction')
    expect(serializedResponse).toBeInstanceOf(Uint8Array)

    const response = new BinaryCreateTransactionResponse(serializedResponse)
    const transaction = new TransactionPosted(
      Buffer.from(response.serializedTransactionPosted()),
    )
    expect(transaction.fee()).toEqual(transactionFee)
  })
})
