/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, multisig } from '@ironfish/rust-nodejs'
import { Assert } from '../../assert'
import {
  createNodeTest,
  useAccountFixture,
  useMinerBlockFixture,
  useTxFixture,
} from '../../testUtilities'
import { AsyncUtils } from '../../utils'
import { getNoteOutpoint, NOTE_OUTPOINT_LENGTH } from '../interfaces/noteOutpoint'
import { DecryptedNoteValue } from './decryptedNoteValue'

describe('WalletDB', () => {
  const nodeTest = createNodeTest()

  describe('loadNoteOutpointsInSequenceRange', () => {
    it('loads note hashes in the provided range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      await walletDb.sequenceToNoteOutpoint.put(
        [account.prefix, [1, Buffer.from('1', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteOutpoint.put(
        [account.prefix, [10, Buffer.from('10', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteOutpoint.put(
        [account.prefix, [100, Buffer.from('100', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteOutpoint.put(
        [account.prefix, [1000, Buffer.from('1000', 'hex')]],
        null,
      )
      await walletDb.sequenceToNoteOutpoint.put(
        [account.prefix, [10000, Buffer.from('10000', 'hex')]],
        null,
      )

      const noteHashes = await AsyncUtils.materialize(
        walletDb.loadNoteOutpointsInSequenceRange(account, 2, 9999),
      )

      expect(noteHashes).toHaveLength(3)
      expect(noteHashes[0]).toEqualBuffer(Buffer.from('10', 'hex'))
      expect(noteHashes[1]).toEqualBuffer(Buffer.from('100', 'hex'))
      expect(noteHashes[2]).toEqualBuffer(Buffer.from('1000', 'hex'))
    })
  })

  describe('loadUnspentNotesByValue', () => {
    it('notes should be returned in order of value', async () => {
      const { node } = await nodeTest.createSetup()
      const account = await useAccountFixture(node.wallet)

      const block1 = await useMinerBlockFixture(node.chain, undefined, account)
      await expect(node.chain).toAddBlock(block1)
      await node.wallet.updateHead()

      for (let i = 1; i < 3; i++) {
        const transaction = await useTxFixture(node.wallet, account, account)
        await expect(node.chain).toAddBlock(
          await useMinerBlockFixture(node.chain, undefined, undefined, undefined, [
            transaction,
          ]),
        )
        await node.wallet.updateHead()
      }

      const walletDb = node.wallet.walletDb
      const noteOutpoints = await AsyncUtils.materialize(
        walletDb.loadValueToUnspentNoteOutpoints(account, Asset.nativeId()),
      )
      const unspentNotes = await AsyncUtils.materialize(
        walletDb.loadUnspentNoteOutpoints(account, Asset.nativeId()),
      )
      const notes = (
        await Promise.all(
          noteOutpoints.map((noteOutpoint) =>
            walletDb.loadDecryptedNote(account, noteOutpoint),
          ),
        )
      ).filter((note) => note !== undefined) as DecryptedNoteValue[]

      expect(notes).toHaveLength(unspentNotes.length)

      let previousNoteValue = notes[0].note.value()

      for (const note of notes) {
        expect(note.note.value()).toBeGreaterThanOrEqual(previousNoteValue)
        previousNoteValue = note.note.value()
      }
    })

    it('keys should be stored in order', async () => {
      const { node } = await nodeTest.createSetup()
      const walletDb = node.wallet.walletDb
      const account = await useAccountFixture(node.wallet)

      await Promise.all(
        [1n, 10n, 100n, 1000n, 10000n].map((value) => {
          return walletDb.valueToUnspentNoteOutpoints.put(
            [
              account.prefix,
              Asset.nativeId(),
              value,
              Buffer.alloc(NOTE_OUTPOINT_LENGTH, Math.random().toString()),
            ],
            null,
          )
        }),
      )

      const allNotes = await walletDb.valueToUnspentNoteOutpoints.getAllKeys()

      const correctOrder = [1n, 10n, 100n, 1000n, 10000n]

      const values = allNotes.map((note) => note[2])

      expect(values).toEqual(correctOrder)
    })

    it('deleting and saving unspent note hashes note also does the same with valueToNoteHash', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb
      const account = await useAccountFixture(node.wallet)

      const block = await useMinerBlockFixture(node.chain, 0, account)
      await node.chain.addBlock(block)
      await node.wallet.updateHead()

      const noteHash: Buffer = block.transactions[0].notes[0].hash()
      const decryptedNote = await account.getDecryptedNote(noteHash)
      Assert.isNotUndefined(decryptedNote)
      const sorted1 = await AsyncUtils.materialize(
        walletDb.loadValueToUnspentNoteOutpoints(account, Asset.nativeId()),
      )
      const unsorted1 = await AsyncUtils.materialize(
        walletDb.loadUnspentNotes(account, Asset.nativeId()),
      )
      expect(sorted1.length).toEqual(1)
      expect(unsorted1.length).toEqual(1)

      await walletDb.deleteUnspentNoteOutpoint(account, noteHash, decryptedNote)
      const sorted2 = await AsyncUtils.materialize(
        walletDb.loadValueToUnspentNoteOutpoints(account, Asset.nativeId()),
      )
      expect(sorted2.length).toEqual(0)
      const unsorted2 = await AsyncUtils.materialize(
        walletDb.loadUnspentNotes(account, Asset.nativeId()),
      )
      expect(unsorted2.length).toEqual(0)

      await walletDb.addUnspentNoteOutpoint(account, noteHash, decryptedNote)
      const sorted3 = await AsyncUtils.materialize(
        walletDb.loadValueToUnspentNoteOutpoints(account, Asset.nativeId()),
      )
      expect(sorted3.length).toEqual(1)
      const unsorted3 = await AsyncUtils.materialize(
        walletDb.loadUnspentNotes(account, Asset.nativeId()),
      )
      expect(unsorted3.length).toEqual(1)
    })
  })

  describe('loadTransactionHashesInSequenceRange', () => {
    it('loads transaction hashes in the provided range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [2, Buffer.from('2', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [20, Buffer.from('20', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [200, Buffer.from('200', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [2000, Buffer.from('2000', 'hex')]],
        null,
      )
      await walletDb.sequenceToTransactionHash.put(
        [account.prefix, [20000, Buffer.from('20000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadTransactionHashesInSequenceRange(account, 2, 9999),
      )

      expect(transactionHashes).toHaveLength(4)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('2', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('20', 'hex'))
      expect(transactionHashes[2]).toEqualBuffer(Buffer.from('200', 'hex'))
      expect(transactionHashes[3]).toEqualBuffer(Buffer.from('2000', 'hex'))
    })
  })

  describe('loadExpiredTransactionHashes', () => {
    it('loads transaction hashes with expiration sequences in the expired range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      // expiration of 0 never expires
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [0, Buffer.from('0', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [3, Buffer.from('3', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [30, Buffer.from('30', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [300, Buffer.from('300', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [3000, Buffer.from('3000', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [30000, Buffer.from('30000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadExpiredTransactionHashes(account, 3000),
      )

      expect(transactionHashes).toHaveLength(4)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('3', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('30', 'hex'))
      expect(transactionHashes[2]).toEqualBuffer(Buffer.from('300', 'hex'))
      expect(transactionHashes[3]).toEqualBuffer(Buffer.from('3000', 'hex'))
    })
  })

  describe('loadPendingTransactionHashes', () => {
    it('loads transaction hashes with expiration sequences outside the expired range', async () => {
      const { node } = await nodeTest.createSetup()

      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet)

      // expiration of 0 never expires
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [0, Buffer.from('0', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [4, Buffer.from('4', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [40, Buffer.from('40', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [400, Buffer.from('400', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [4000, Buffer.from('4000', 'hex')]],
        null,
      )
      await walletDb.pendingTransactionHashes.put(
        [account.prefix, [40000, Buffer.from('40000', 'hex')]],
        null,
      )

      const transactionHashes = await AsyncUtils.materialize(
        walletDb.loadPendingTransactionHashes(account, 4000),
      )

      expect(transactionHashes).toHaveLength(2)
      expect(transactionHashes[0]).toEqualBuffer(Buffer.from('0', 'hex'))
      expect(transactionHashes[1]).toEqualBuffer(Buffer.from('40000', 'hex'))
    })
  })

  describe('loadDecryptedNotes', () => {
    it('loads decrypted notes greater than or equal to a given key', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb
      const account = await useAccountFixture(node.wallet)
      const noteOutpoints: Buffer[] = []

      for (let i = 2; i < 6; i++) {
        const block = await useMinerBlockFixture(node.chain, i, account)
        await node.chain.addBlock(block)
        await node.wallet.updateHead()

        noteOutpoints.push(getNoteOutpoint(block.transactions[0], 0))
      }

      noteOutpoints.sort(Buffer.compare)

      const upperRange = {
        gte: walletDb.decryptedNotes.keyEncoding.serialize([account.prefix, noteOutpoints[2]]),
      }

      const upperRangeNotes = await AsyncUtils.materialize(
        walletDb.loadDecryptedNotes(account, upperRange),
      )
      expect(upperRangeNotes.length).toEqual(2)
      // expect(upperRangeNotes[0].hash).toEqual(noteOutpoints[2])
      // expect(upperRangeNotes[1].hash).toEqual(noteOutpoints[3])
    })

    it('loads decrypted notes less than a given key', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb
      const account = await useAccountFixture(node.wallet)
      const noteHashes: Buffer[] = []

      for (let i = 2; i < 6; i++) {
        const block = await useMinerBlockFixture(node.chain, i, account)
        await node.chain.addBlock(block)
        await node.wallet.updateHead()

        noteHashes.push(block.transactions[0].notes[0].hash())
      }

      noteHashes.sort(Buffer.compare)

      const lowerRange = {
        lt: walletDb.decryptedNotes.keyEncoding.serialize([account.prefix, noteHashes[2]]),
      }

      const lowerRangeNotes = await AsyncUtils.materialize(
        walletDb.loadDecryptedNotes(account, lowerRange),
      )
      expect(lowerRangeNotes.length).toEqual(2)
      expect(lowerRangeNotes[0].hash).toEqual(noteHashes[0])
      expect(lowerRangeNotes[1].hash).toEqual(noteHashes[1])
    })
  })

  describe('loadTransactions', () => {
    it('loads transactions within a given key range', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb
      const account = await useAccountFixture(node.wallet)
      const transactionHashes: Buffer[] = []

      for (let i = 2; i < 6; i++) {
        const block = await useMinerBlockFixture(node.chain, i, account)
        await node.chain.addBlock(block)
        await node.wallet.updateHead()

        transactionHashes.push(block.transactions[0].hash())
      }

      transactionHashes.sort(Buffer.compare)

      const keyRange = {
        gte: walletDb.transactions.keyEncoding.serialize([
          account.prefix,
          transactionHashes[1],
        ]),
        lt: walletDb.transactions.keyEncoding.serialize([account.prefix, transactionHashes[3]]),
      }

      const transactions = await AsyncUtils.materialize(
        walletDb.loadTransactions(account, keyRange),
      )
      expect(transactions.length).toEqual(transactionHashes.length - 2)
      expect(transactions[0].transaction.hash()).toEqual(transactionHashes[1])
      expect(transactions[1].transaction.hash()).toEqual(transactionHashes[2])
    })
  })

  describe('multisigSecrets', () => {
    it('should store named ParticipantSecret as buffer', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb

      const name = 'test'
      const secret = multisig.ParticipantSecret.random()
      const serializedSecret = secret.serialize()

      await walletDb.putMultisigSecret(secret.toIdentity().serialize(), {
        secret: serializedSecret,
        name,
      })

      const storedSecret = await walletDb.getMultisigSecretByName(name)
      Assert.isNotUndefined(storedSecret)
      expect(storedSecret.secret).toEqualBuffer(serializedSecret)
    })
  })

  describe('participantIdentities', () => {
    it('should store participant identities for a multisig account', async () => {
      const node = (await nodeTest.createSetup()).node
      const walletDb = node.wallet.walletDb

      const account = await useAccountFixture(node.wallet, 'multisig')

      const identity = multisig.ParticipantSecret.random().toIdentity()

      await walletDb.addParticipantIdentity(account, identity.serialize())

      const storedIdentities = await AsyncUtils.materialize(
        walletDb.getParticipantIdentities(account),
      )

      expect(storedIdentities.length).toEqual(1)
      expect(storedIdentities[0]).toEqualBuffer(identity.serialize())
    })
  })
})
