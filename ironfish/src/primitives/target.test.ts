/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Consensus } from '../consensus'
import { DEVNET } from '../networks/definitions/devnet'
import { Target } from './target'

const TARGET_BLOCK_TIME_IN_SECONDS = 60
const TARGET_BUCKET_TIME_IN_SECONDS = 10
const FISH_HASH_ACTIVATION_SEQUENCE = 999
const SEQUENCE = 5

const CONSENSUS_PARAMETERS = {
  ...DEVNET.consensus,
  enableFishHash: FISH_HASH_ACTIVATION_SEQUENCE,
}

describe('Target', () => {
  it('constructs targets', () => {
    expect(new Target(BigInt(9999999999999)).asBigInt()).toEqual(BigInt(9999999999999))
    expect(new Target(Buffer.from([4, 8])).asBigInt()).toEqual(BigInt('1032'))
    expect(new Target(Buffer.from([0, 0, 0, 0, 0, 0, 0, 4, 8])).asBigInt()).toEqual(
      BigInt('1032'),
    )
    expect(new Target(Buffer.alloc(32)).asBigInt()).toEqual(BigInt('0'))
  })

  it('throws when constructed with too big an array', () => {
    const bytes = Buffer.alloc(33)
    bytes[0] = 1
    expect(() => new Target(bytes)).toThrow(`Target value exceeds max target`)
  })

  it('has the correct max value', () => {
    // The minimum difficulty is 131072, which means the maximum target is 2**256 / 131072
    const maxTarget = BigInt(2) ** BigInt(256) / BigInt(Target.minDifficulty())
    expect(Target.maxTarget().asBigInt()).toBe(maxTarget)
  })

  it('adjusts target up', () => {
    expect(new Target('55').adjust(BigInt('5')).targetValue).toEqual(BigInt('60'))
  })

  it('adjusts target down', () => {
    expect(new Target('55').adjust(BigInt('-5')).targetValue).toEqual(BigInt('50'))
  })

  it("doesn't adjust negative", () => {
    expect(new Target('55').adjust(BigInt('-60')).targetValue).toEqual(BigInt('55'))
  })

  it("doesn't adjust past max", () => {
    expect(Target.maxTarget().adjust(BigInt('-5')).adjust(BigInt('10')).targetValue).toEqual(
      Target.maxTarget().adjust(BigInt('-5')).targetValue,
    )
  })

  it('meets other target values', () => {
    const target = new Target('43')
    expect(Target.meets(BigInt(42), target)).toBe(true)
    expect(Target.meets(BigInt(43), target)).toBe(true)
    expect(Target.meets(BigInt(44), target)).toBe(false)
  })

  it('checks target equality', () => {
    const a = new Target('588888')
    const b = new Target('588888')
    const c = new Target('325434')

    expect(a.equals(b)).toBe(true)
    expect(a.equals(c)).toBe(false)
    expect(b.equals(c)).toBe(false)
  })
})

describe('Calculate target', () => {
  let consensus: Consensus

  beforeAll(() => {
    consensus = new Consensus(CONSENSUS_PARAMETERS)
  })

  it('increases difficulty if a new block is coming in before the target range time', () => {
    const now = new Date()
    /**
     * if new block comes in at these time ranges after the previous parent block, then difficulty is adjust as:
     * 0  - 5  seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 6
     * 5  - 15 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 5
     * 15 - 25 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 4
     * 25 - 35 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 3
     * 35 - 45 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 2
     * 45 - 55 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 1
     **/
    for (let i = 0; i < 55; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const bucketFromParent =
        TARGET_BLOCK_TIME_IN_SECONDS / TARGET_BUCKET_TIME_IN_SECONDS -
        Math.round(i / TARGET_BUCKET_TIME_IN_SECONDS)

      const diffInDifficulty = (difficulty / BigInt(2048)) * BigInt(bucketFromParent)

      const newDifficulty = Target.calculateDifficulty(
        consensus,
        SEQUENCE,
        time,
        now,
        difficulty,
      )
      const newTarget = Target.calculateTarget(consensus, SEQUENCE, time, now, target)
      expect(newDifficulty).toBeGreaterThan(difficulty)
      expect(BigInt(difficulty) + diffInDifficulty).toEqual(newDifficulty)

      expect(newTarget.targetValue).toBeLessThan(target.targetValue)
    }
  })

  it('keeps difficulty/target of parent block header if time difference is between 55 and 65 seconds', () => {
    const now = new Date()
    for (let i = 55; i < 65; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const newDifficulty = Target.calculateDifficulty(
        consensus,
        SEQUENCE,
        time,
        now,
        difficulty,
      )
      const newTarget = Target.calculateTarget(consensus, SEQUENCE, time, now, target)

      const diffInDifficulty = BigInt(newDifficulty) - difficulty

      expect(diffInDifficulty).toEqual(BigInt(0))
      expect(newTarget.targetValue).toEqual(target.targetValue)
    }
  })

  it('decreases difficulty if a new block is coming in after the target range time', () => {
    const now = new Date()

    /**
     * if new block comes after target block mining time + half bucket time, then difficulty is adjust as:
     * 65 - 75 seconds: difficulty = parentDifficulty - (parentDifficulty / 2048 * 1)
     * 75 - 85 seconds: difficulty = parentDifficulty - (parentDifficulty / 2048 * 2)
     * 85 - 95 seconds: difficulty = parentDifficulty - (parentDifficulty / 2048 * 3)
     * ...
     */
    for (let i = 65; i < 100; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const bucketFromParent =
        Math.round(i / TARGET_BUCKET_TIME_IN_SECONDS) -
        TARGET_BLOCK_TIME_IN_SECONDS / TARGET_BUCKET_TIME_IN_SECONDS

      const diffInDifficulty = (difficulty / BigInt(2048)) * BigInt(bucketFromParent)

      const newDifficulty = Target.calculateDifficulty(
        consensus,
        SEQUENCE,
        time,
        now,
        difficulty,
      )
      const newTarget = Target.calculateTarget(consensus, SEQUENCE, time, now, target)
      expect(newDifficulty).toBeLessThan(difficulty)
      expect(BigInt(newDifficulty) + diffInDifficulty).toEqual(difficulty)

      expect(newTarget.asBigInt()).toBeGreaterThan(target.asBigInt())
    }
  })

  it('adjusts difficulty only if the given sequence is the fish hash activation sequence', () => {
    const now = new Date()
    const difficulty = BigInt(231072000)
    const previousBlockTarget = Target.fromDifficulty(difficulty)

    const nonActivationSequence = Target.calculateTarget(
      consensus,
      FISH_HASH_ACTIVATION_SEQUENCE - 1,
      new Date(now.getTime() + 60 * 1000),
      now,
      previousBlockTarget,
    )

    expect(nonActivationSequence.toDifficulty()).toEqual(difficulty)

    const activationSequence = Target.calculateTarget(
      consensus,
      FISH_HASH_ACTIVATION_SEQUENCE,
      new Date(now.getTime() + 60 * 1000),
      now,
      previousBlockTarget,
    )

    expect(activationSequence.toDifficulty()).toEqual(difficulty / 100n)

    const postActivationSequence = Target.calculateTarget(
      consensus,
      FISH_HASH_ACTIVATION_SEQUENCE + 1,
      new Date(now.getTime() + 60 * 1000),
      now,
      previousBlockTarget,
    )

    expect(postActivationSequence.toDifficulty()).toEqual(difficulty)
  })

  describe('max buckets', () => {
    it('no matter how late blocks come in, we clamp difficulty change by `maxBuckets` buckets (steps) away from previous block difficulty', () => {
      const now = new Date()
      const difficulty = BigInt(231072)
      const previousBlockTarget = Target.fromDifficulty(difficulty)
      // MAX_BUCKETS buckets away from previous block target
      const maximallyDifferentTarget = Target.calculateTarget(
        consensus,
        SEQUENCE,
        new Date(now.getTime() + 1065 * 1000),
        now,
        previousBlockTarget,
      )

      // Sanity check that difficulty is different in the bucket prior
      const almostMaxTarget = Target.calculateTarget(
        consensus,
        SEQUENCE,
        new Date(now.getTime() + 1035 * 1000),
        now,
        previousBlockTarget,
      )
      expect(almostMaxTarget.asBigInt()).toBeLessThan(maximallyDifferentTarget.asBigInt())

      // check that we don't change difficulty by more than `maxBuckets` buckets (steps)
      // away from previous block difficulty
      for (let i = 1065; i < 1070; i++) {
        const time = new Date(now.getTime() + i * 1000)

        const newTarget = Target.calculateTarget(
          consensus,
          SEQUENCE,
          time,
          now,
          previousBlockTarget,
        )

        expect(newTarget).toEqual(maximallyDifferentTarget)
      }
    })

    it('correctly adjusts to a different number provided by consensus', () => {
      const modifiedConsensus = new Consensus({
        ...CONSENSUS_PARAMETERS,
        enableIncreasedDifficultyChange: SEQUENCE,
      })
      const now = new Date()
      const difficulty = BigInt(23107200)
      const previousBlockTarget = Target.fromDifficulty(difficulty)
      // max buckets away from previous block target
      const maximallyDifferentTarget = Target.calculateTarget(
        modifiedConsensus,
        SEQUENCE,
        new Date(now.getTime() + 2065 * 1000),
        now,
        previousBlockTarget,
      )

      // Sanity check that difficulty is different in the bucket prior
      const almostMaxTarget = Target.calculateTarget(
        modifiedConsensus,
        SEQUENCE,
        new Date(now.getTime() + 2045 * 1000),
        now,
        previousBlockTarget,
      )
      expect(almostMaxTarget.asBigInt()).toBeLessThan(maximallyDifferentTarget.asBigInt())

      // check that we don't change difficulty by more than 200 buckets (steps)
      // away from previous block difficulty
      for (let i = 2065; i < 2070; i++) {
        const time = new Date(now.getTime() + i * 1000)

        const newTarget = Target.calculateTarget(
          modifiedConsensus,
          SEQUENCE,
          time,
          now,
          previousBlockTarget,
        )

        expect(newTarget).toEqual(maximallyDifferentTarget)
      }
    })
  })

  describe('fromDifficulty', () => {
    it('does not divide by zero', () => {
      expect(() => Target.fromDifficulty(0n)).not.toThrow(RangeError)
    })

    it('does not return values outside the 256 bit range', () => {
      expect(Target.fromDifficulty(1n).targetValue).toBeLessThanOrEqual(2n ** 256n - 1n)
    })

    it('returns the maximum target for difficulty below the minimum', () => {
      expect(Target.fromDifficulty(Target.minDifficulty() - 1n)).toEqual(Target.maxTarget())
    })
  })

  describe('toDifficulty', () => {
    it('does not divide by zero', () => {
      expect(Target.minTarget().toDifficulty).not.toThrow(RangeError)
    })
  })
})
