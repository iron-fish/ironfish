/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { bigIntToBytes, bytesToBigInt, Target, TargetSerde } from './target'

/**
 * The logic of method calculation the increase/descreas difficulty
 * if block was mined less than 40 seconds -> increase difficulty (the block has been found too fast)
 * if block was mined between 40 and 80 seconds -> do nothing (averagate block mining time will be -->> 60 seconds)
 * if block was mined more than 80+ seconds -> decrease difficulty
 */
describe('Target', () => {
  it('converts bigints to bytes and back', () => {
    const bigints = [
      BigInt(0),
      BigInt(
        '9999999999999999999999999999999999999999999999999999999999999999999999999999999999',
      ),
      BigInt(255),
      BigInt(256),
      BigInt(1024),
      BigInt(1025),
    ]
    for (const candidate of bigints) {
      const bytes = bigIntToBytes(candidate)
      const back = bytesToBigInt(bytes)
      expect(back).toEqual(candidate)
    }
  })

  it('converts empty array to 0', () => {
    expect(bytesToBigInt(Buffer.from([]))).toEqual(BigInt(0))
  })

  it('constructs targets', () => {
    expect(new Target().asBigInt()).toEqual(BigInt(0))
    expect(new Target(BigInt(9999999999999)).asBigInt()).toEqual(BigInt(9999999999999))
    expect(new Target(Buffer.from([4, 8])).asBigInt()).toEqual(BigInt('1032'))
    expect(new Target(Buffer.from([0, 0, 0, 0, 0, 0, 0, 4, 8])).asBigInt()).toEqual(
      BigInt('1032'),
    )
    expect(new Target(Buffer.alloc(32)).asBigInt()).toEqual(BigInt('0'))
  })

  it('makes the correct bytes', () => {
    const bigints = [
      BigInt(0),
      BigInt('99999999999999999999999999999999999999999999999999999999999999999999999'),
      BigInt(255),
      BigInt(256),
      BigInt(1024),
      BigInt(1025),
    ]
    for (const candidate of bigints) {
      expect(new Target(candidate).asBytes()).toMatchSnapshot()
    }
  })

  it('throws when constructed with too big an array', () => {
    const bytes = Buffer.alloc(33)
    bytes[0] = 1
    expect(() => new Target(bytes)).toThrowErrorMatchingInlineSnapshot(
      `"Target value exceeds max target"`,
    )
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
})

describe('TargetSerde', () => {
  const serde = new TargetSerde()
  it('checks target equality', () => {
    expect(serde.equals(new Target('588888'), new Target('588888'))).toBe(true)
  })
  it('serializes and deserializes bytes', () => {
    const target = new Target(500)
    const serialized = serde.serialize(target)
    expect(serialized).toMatchInlineSnapshot(`"500"`)
    const deserialized = serde.deserialize(serialized)
    expect(serde.equals(deserialized, target)).toBe(true)
  })
  it('throws when deserializing incorrect value', () => {
    expect(() => serde.deserialize('not a number')).toThrowErrorMatchingInlineSnapshot(
      `"Cannot convert not a number to a BigInt"`,
    )
    // @ts-expect-error Argument of type '{ not: string; }' is not assignable to parameter of type 'string'.ts(2345)
    expect(() => serde.deserialize({ not: 'a string' })).toThrowErrorMatchingInlineSnapshot(
      `"Can only deserialize Target from string"`,
    )
  })
})

describe('Calculate target', () => {
  it('can increase target (which decreases difficulty) if its taking too long to mine a block (20+ seconds since last block)', () => {
    const now = new Date()
    // for any time 80 - 90 seconds after the last block, difficulty should decrease by previous block's difficulty / BigInt(2048)
    for (let i = 80; i < 120; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const diffInDifficulty = difficulty / BigInt(2048)

      const newDifficulty = Target.calculateDifficulty(time, now, difficulty)
      const newTarget = Target.calculateTarget(time, now, target)

      expect(newDifficulty).toBeLessThan(difficulty)
      expect(BigInt(newDifficulty) + diffInDifficulty).toEqual(difficulty)

      expect(newTarget.asBigInt()).toBeGreaterThan(target.asBigInt())
    }

    // for any time 120 - 140 seconds after the last block, difficulty should decrease by previous block's difficulty / BigInt(2048) * 2
    for (let i = 120; i < 140; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const diffInDifficulty = (difficulty / BigInt(2048)) * BigInt(2)

      const newDifficulty = Target.calculateDifficulty(time, now, difficulty)
      const newTarget = Target.calculateTarget(time, now, target)

      expect(newDifficulty).toBeLessThan(difficulty)
      expect(BigInt(newDifficulty) + diffInDifficulty).toEqual(difficulty)

      expect(newTarget.asBigInt()).toBeGreaterThan(target.asBigInt())
    }
  })

  it('can decrease target (which increases difficulty) if a block is trying to come in too early (1-39 seconds)', () => {
    const now = new Date()
    for (let i = 1; i < 39; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const diffInDifficulty = difficulty / BigInt(2048)

      const newDifficulty = Target.calculateDifficulty(time, now, difficulty)
      const newTarget = Target.calculateTarget(time, now, target)

      expect(newDifficulty).toBeGreaterThan(difficulty)
      expect(BigInt(difficulty) + diffInDifficulty).toEqual(newDifficulty)

      expect(newTarget.targetValue).toBeLessThan(target.targetValue)
    }
  })

  it('keeps difficulty/target of parent block header if time differnece is between 40 and 80 seconds', () => {
    const now = new Date()
    for (let i = 40; i < 80; i++) {
      const time = new Date(now.getTime() + i * 1000)

      const difficulty = BigInt(231072)
      const target = Target.fromDifficulty(difficulty)

      const newDifficulty = Target.calculateDifficulty(time, now, difficulty)
      const newTarget = Target.calculateTarget(time, now, target)

      const diffInDifficulty = BigInt(newDifficulty) - difficulty

      expect(diffInDifficulty).toEqual(BigInt(0))
      expect(newDifficulty).toEqual(difficulty)
      expect(newTarget.targetValue).toEqual(target.targetValue)
    }
  })
})
