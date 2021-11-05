/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { FREEZE_TIME_IN_SECONDS, TARGET_BLOCK_TIME_IN_SECONDS } from '../consensus'
import { Target } from './target'

describe('Target', () => {
  it('constructs targets', () => {
    expect(new Target().asBigInt()).toEqual(BigInt(0))
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
    expect(() => new Target(bytes)).toThrowError(`Target value exceeds max target`)
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
  /**
   * if new block comes in at these time ranges after the previous parent block, then difficulty is adjust as:
   * 0 - 5 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 6
   * 5 - 15 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 5
   * 15 - 25 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 4
   * 25 - 35 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 3
   * 35 - 45 seconds: difficulty = parentDifficulty + parentDifficulty / 2048 * 2
   * 45 - 55 seconds: difficulty = parentDifficulty + parentDifficulty / 2048
   * 55 - 65 seconds: difficulty = parentDifficulty
   * 65 - 75 seconds: difficulty = parentDifficulty - parentDifficulty / 2048
   * 75 - 85 seconds: difficulty = parentDifficulty - (parentDifficulty / 2048 * 2)
   * ...
   */

  const findBucket = function (targetTime: number, allowedSlippage: number, blockTime: number) {
    let bucket = 0
    let startingPoint =
      blockTime > targetTime + allowedSlippage
        ? targetTime + allowedSlippage
        : targetTime - allowedSlippage
    if (blockTime <= targetTime - allowedSlippage) {
      startingPoint = targetTime - allowedSlippage
      while (startingPoint > blockTime) {
        startingPoint = startingPoint - allowedSlippage * 2
        bucket++
      }
    } else if (blockTime >= targetTime + allowedSlippage) {
      startingPoint = blockTime
      while (startingPoint >= targetTime + allowedSlippage) {
        startingPoint = startingPoint - allowedSlippage * 2
        bucket++
      }
    }

    return bucket
  }

  it('adjusts difficulty', () => {
    const now = new Date()

    for (let i = 1; i < 100; i++) {
      const blockTime = i
      const parentDifficulty = BigInt(231072)

      const targetTime = 60
      const allowedSlippage = 5

      const bucketFromTarget = findBucket(targetTime, allowedSlippage, blockTime)

      const diffInDifficulty = (parentDifficulty / BigInt(2048)) * BigInt(bucketFromTarget)

      const expectedDifficulty =
        blockTime < targetTime
          ? parentDifficulty + diffInDifficulty
          : parentDifficulty - diffInDifficulty

      const newDifficulty = Target.calculateDifficulty(
        new Date(now.getTime() + blockTime * 1000),
        now,
        parentDifficulty,
      )

      expect(newDifficulty).toEqual(expectedDifficulty)

      const newTarget = Target.calculateTarget(
        new Date(now.getTime() + blockTime * 1000),
        now,
        Target.fromDifficulty(parentDifficulty),
      )
      expect(newTarget).toEqual(Target.fromDifficulty(expectedDifficulty))
    }
  })
})
