/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { TARGET_BLOCK_TIME_IN_SECONDS, TARGET_BUCKET_TIME_IN_SECONDS } from '../consensus'
import { BigIntUtils } from '../utils/bigint'

/**
 *  Minimum difficulty, which is equivalent to maximum target
 */
const MIN_DIFFICULTY = BigInt(131072)

/**
 * Maximum target, which is equivalent of minimum difficulty of 131072
 * target == 2**256 / difficulty
 */
const MAX_TARGET = BigInt(
  '883423532389192164791648750371459257913741948437809479060803100646309888',
)

/**
 *  Maximum number to represent a 256 bit number, which is 2**256 - 1
 */
const MAX_256_BIT_NUM = BigInt(
  '115792089237316195423570985008687907853269984665640564039457584007913129639935',
)

export class Target {
  targetValue: bigint
  constructor(targetValue: bigint | Buffer | string | number | undefined = undefined) {
    if (targetValue === undefined) {
      this.targetValue = BigInt(0)
    } else {
      const candidate =
        targetValue instanceof Buffer ? BigIntUtils.fromBytes(targetValue) : BigInt(targetValue)

      if (candidate > MAX_256_BIT_NUM) {
        throw new Error('Target value exceeds max target')
      } else {
        this.targetValue = candidate
      }
    }
  }

  /**
   * Maximum target (in terms of difficulty), which is equivalent of
   * minimum difficulty of 131072
   * maximum target == minimum difficulty
   * target == 2**256 / difficulty
   */
  static maxTarget(): Target {
    return new Target(MAX_TARGET)
  }

  static minTarget(): Target {
    return new Target(0)
  }

  /**
   * The initial target on the genesis block.
   *
   * This will need to be hand-tuned.
   */
  static initialTarget(): Target {
    return this.maxTarget()
  }

  /**
   * Calculate the target for the current block given the timestamp in that
   * block's header, the pervious block's timestamp and previous block's target.
   *
   * To verify whether a target on a block is correct, pass in the timestamp in its header,
   * its previous block's timestamp, and its previous block's target
   * and compare the resulting target to what is specified on the current block header
   *
   * @param time the block's timestamp for which the target is calculated for
   * @param previousBlockTimestamp the block's previous block header's timestamp
   * @param previousBlockTarget the block's previous block header's target
   */
  static calculateTarget(
    time: Date,
    previousBlockTimestamp: Date,
    previousBlockTarget: Target,
  ): Target {
    const parentDifficulty = previousBlockTarget.toDifficulty()

    const difficulty = Target.calculateDifficulty(
      time,
      previousBlockTimestamp,
      parentDifficulty,
    )

    return Target.fromDifficulty(difficulty)
  }

  /**
   * Calculate the difficulty for the current block given the timestamp in that
   * block's header, the previous block's timestamp and previous block's target.
   *
   * Note that difficulty == 2**256 / target and target == 2**256 / difficulty
   *
   * Algorithm: difficulty = parentDifficulty - (parentDifficulty / 2048) * bucket
   * Where bucket is how many steps (in TARGET_BUCKET_TIME_IN_SECONDS) the new time is away from
   * our target bucket range, e.g. for target block time of 60 seconds (with +/-5 seconds forgiveness):
   * 35 - 45 seconds: bucket -2
   * 45 - 55 seconds: bucket -1
   * 55 - 65 seconds: bucket 0
   * 65 - 75 seconds: bucket 1
   * 75 - 85 seconds: bucket 2
   * .. and so on
   *
   * Returns the difficulty for a block given it timestamp for that block and its parent.
   * @param time the block's timestamp for which the target is calcualted for
   * @param previousBlockTimestamp the block's previous block header's timestamp
   * @param previousBlockTarget the block's previous block header's target
   */
  static calculateDifficulty(
    time: Date,
    previousBlockTimestamp: Date,
    previousBlockDifficulty: bigint,
  ): bigint {
    const diffInSeconds = (time.getTime() - previousBlockTimestamp.getTime()) / 1000

    let bucket = Math.floor(
      (diffInSeconds -
        TARGET_BLOCK_TIME_IN_SECONDS +
        Math.floor(TARGET_BUCKET_TIME_IN_SECONDS / 2)) /
        TARGET_BUCKET_TIME_IN_SECONDS,
    )

    // Should not change difficulty by more than 99 buckets from last block's difficulty
    bucket = Math.min(bucket, 99)

    const difficulty =
      previousBlockDifficulty - (previousBlockDifficulty / BigInt(2048)) * BigInt(bucket)

    return BigIntUtils.max(difficulty, Target.minDifficulty())
  }

  /**
   * Returns the minimum difficulty that can be used for Iron Fish blocks
   * To be used in calculateTarget for easier mocking
   */
  static minDifficulty(): bigint {
    return MIN_DIFFICULTY
  }

  /**
   * Converts difficulty to Target
   */
  static fromDifficulty(difficulty: bigint): Target {
    if (difficulty === BigInt(1)) {
      return new Target(MAX_256_BIT_NUM)
    }
    return new Target((BigInt(2) ** BigInt(256) / BigInt(difficulty)).valueOf())
  }

  /**
   * Return the difficulty representation as a big integer
   */
  toDifficulty(): bigint {
    return BigInt(2) ** BigInt(256) / this.targetValue
  }

  /**
   * Add the given amout to the target's value. A negative amount makes the target
   * harder to achieve, a positive one makes it easier.
   *
   * If adjustment would make target negative or higher than max allowed value,
   * the current target is returned unchanged.
   */
  adjust(amount: bigint): Target {
    let adjusted = this.targetValue + amount
    if (adjusted > MAX_TARGET || adjusted < 0) {
      adjusted = this.targetValue
    }
    return new Target(adjusted)
  }

  /**
   * Return whether or not this target meets the requirements of the given target,
   * which is to say, this has a lower numeric value then the provided one.
   */
  static meets(hashValue: BigInt, target: Target): boolean {
    return hashValue <= target.targetValue
  }

  /**
   * Return the target number as a big integer
   */
  asBigInt(): bigint {
    return this.targetValue
  }

  equals(other: Target): boolean {
    return this.targetValue === other.targetValue
  }
}
