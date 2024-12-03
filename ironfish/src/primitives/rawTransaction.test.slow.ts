/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, generateKey, Note as NativeNote } from '@ironfish/rust-nodejs'
import { makeFakeWitness } from '../devUtils'
import { useAccountFixture, useTxFixture } from '../testUtilities'
import { createNodeTest } from '../testUtilities/nodeTest'
import { SpendingAccount } from '../wallet'
import { Note } from './note'
import { RawTransaction } from './rawTransaction'
import { TransactionVersion } from './transaction'

const TEST_ASSET_ID_1: Buffer = Buffer.from(
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaac',
  'hex',
)
const TEST_ASSET_ID_2: Buffer = Buffer.from(
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbba',
  'hex',
)

type TestRawTransactionOptions = {
  withExpiration: boolean
  withFee: boolean
  withMints: boolean
  withBurns: boolean
  withOutputs: boolean
  withTransferAssetOwnership: boolean
}

function createTestRawTransaction(
  account: SpendingAccount,
  version: TransactionVersion,
  options: Partial<TestRawTransactionOptions>,
): RawTransaction {
  const raw = new RawTransaction(version)

  if (options.withExpiration) {
    raw.expiration = 123
  }

  if (options.withFee) {
    raw.fee = 1337n
  }

  const note = new Note(
    new NativeNote(
      account.publicAddress,
      123456789n,
      Buffer.from('some memo'),
      Asset.nativeId(),
      generateKey().publicAddress,
    ).serialize(),
  )

  const witness = makeFakeWitness(note)

  raw.spends.push({ note, witness })

  if (options.withMints) {
    raw.mints.push({
      creator: account.publicAddress,
      name: 'an asset',
      metadata: 'some metadata',
      value: 123n,
    })
    raw.mints.push({
      creator: account.publicAddress,
      name: 'another asset',
      metadata: 'some other metadata',
      value: 456n,
    })
  }

  if (options.withTransferAssetOwnership) {
    raw.mints.push({
      creator: account.publicAddress,
      name: 'yet another asset',
      metadata: 'this adds zero tokens but transfer ownership',
      value: 0n,
      transferOwnershipTo: '62c14bfa032aa955b0f3f1dbf83c06007efb0b574f1945320276a7babf1775d7',
    })
    raw.mints.push({
      creator: account.publicAddress,
      name: 'additional asset',
      metadata: 'this adds new tokens and transfers ownership at the same time',
      value: 789n,
      transferOwnershipTo: 'ad04d990138f5401cddba1f42850fdb668e5880f9f26d70c79820a179b319537',
    })
  }

  if (options.withBurns) {
    raw.burns.push({
      assetId: TEST_ASSET_ID_1,
      value: 789n,
    })
    raw.burns.push({
      assetId: TEST_ASSET_ID_2,
      value: 5n,
    })

    const burnNoteA = new Note(
      new NativeNote(
        account.publicAddress,
        123456789n,
        Buffer.from('some memo'),
        TEST_ASSET_ID_1,
        generateKey().publicAddress,
      ).serialize(),
    )

    const burnNoteB = new Note(
      new NativeNote(
        account.publicAddress,
        123456789n,
        Buffer.from('some memo'),
        TEST_ASSET_ID_2,
        generateKey().publicAddress,
      ).serialize(),
    )

    const burnNoteAWitness = makeFakeWitness(burnNoteA)
    const burnNoteBWitness = makeFakeWitness(burnNoteB)

    raw.spends.push({ note: burnNoteA, witness: burnNoteAWitness })
    raw.spends.push({ note: burnNoteB, witness: burnNoteBWitness })
  }

  if (options.withOutputs) {
    const outputNote = new Note(
      new NativeNote(
        generateKey().publicAddress,
        123456789n - raw.fee,
        Buffer.from('some memo'),
        Asset.nativeId(),
        account.publicAddress,
      ).serialize(),
    )

    raw.outputs.push({ note: outputNote })
  }

  return raw
}

/**
 * Given an array of possible flags from `TestRawTransactionOptions`, produces
 * a sequence of all possible combinations of such flags.
 *
 * Example:
 *
 * ```
 * > testOptionCombinations(['withExpiration', 'withFee'])
 * [
 *   { withExpiration: false, withFee: false },
 *   { withExpiration: false, withFee: true  },
 *   { withExpiration: true,  withFee: false },
 *   { withExpiration: true,  withFee: true  },
 * ]
 * ```
 */
function testOptionCombinations(
  flags: Readonly<Array<keyof TestRawTransactionOptions>>,
): Array<Partial<TestRawTransactionOptions>> {
  const combinations = []
  for (let mask = 0; mask < 2 ** flags.length; mask++) {
    const options: Partial<TestRawTransactionOptions> = {}
    for (let index = 0; index < flags.length; index++) {
      const flagName = flags[index]
      const enabled = !!(mask & (1 << index))
      options[flagName] = enabled
    }
    combinations.push(options)
  }
  return combinations
}

function describeTestOptions(options: Partial<TestRawTransactionOptions>): string {
  const description = Object.entries(options)
    .filter(([_flag, enabled]) => enabled)
    .map(([flag, _enabled]) => flag)
  if (description.length) {
    return description.join(', ')
  } else {
    return 'empty'
  }
}

describe('RawTransaction', () => {
  const nodeTest = createNodeTest()

  describe('postedSize', () => {
    describe('v1', () => {
      const flags = [
        'withExpiration',
        'withFee',
        'withMints',
        'withBurns',
        'withOutputs',
      ] as const

      testOptionCombinations(flags).forEach((options) => {
        // eslint-disable-next-line jest/valid-title
        it(describeTestOptions(options), async () => {
          const account = await useAccountFixture(nodeTest.wallet)

          const raw = createTestRawTransaction(account, TransactionVersion.V1, options)
          const serialized = (
            await useTxFixture(
              nodeTest.wallet,
              account,
              account,
              () => {
                return raw.post(account.spendingKey)
              },
              undefined,
              undefined,
              false,
            )
          ).serialize()

          expect(raw.postedSize()).toEqual(serialized.byteLength)
        })
      })
    })

    describe('v2', () => {
      const flags = [
        'withExpiration',
        'withFee',
        'withMints',
        'withBurns',
        'withOutputs',
        'withTransferAssetOwnership',
      ] as const

      testOptionCombinations(flags).forEach((options) => {
        // eslint-disable-next-line jest/valid-title
        it(describeTestOptions(options), async () => {
          const account = await useAccountFixture(nodeTest.wallet)

          const raw = createTestRawTransaction(account, TransactionVersion.V2, options)
          const serialized = (
            await useTxFixture(
              nodeTest.wallet,
              account,
              account,
              () => {
                return raw.post(account.spendingKey)
              },
              undefined,
              undefined,
              false,
            )
          ).serialize()

          expect(raw.postedSize()).toEqual(serialized.byteLength)
        })
      })
    })
  })
})
