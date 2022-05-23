/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The hash used in the "previousHash" field on the initial block in the
 * chain. The initial block is intentionally invalid, so we need to special
 * case it.
 */
export const GENESIS_BLOCK_PREVIOUS = Buffer.alloc(32)

/**
 * The sequence of the genesis block starts at 1
 */
export const GENESIS_BLOCK_SEQUENCE = 1

/**
 * When adding a block, the block can be this amount of seconds into the future
 * without rejecting it
 */
export const ALLOWED_BLOCK_FUTURE_SECONDS = 15

/**
 * The amount of coins in the genesis block
 */
export const GENESIS_SUPPLY_IN_IRON = 42000000

/**
 * The oldest the tip should be before we consider the chain synced
 */
export const MAX_SYNCED_AGE_MS = 5 * 60 * 60 * 1000

/**
 * The maximum allowed requested blocks by the network
 */
export const MAX_REQUESTED_BLOCKS = 50

/**
 * Max size for a message, for instance when requesting batches of blocks
 * TODO 256MB is way too big
 */
export const MAX_MESSAGE_SIZE = 256 * 1024 * 1024

/**
 * The average time that all blocks should be mined
 *
 * NOTE: This is not used in target calculation, or IRON_FISH_YEAR_IN_BLOCKS.
 */
export const TARGET_BLOCK_TIME_IN_SECONDS = 60

/**
 * The time range when difficulty and target not change
 */
export const TARGET_BUCKET_TIME_IN_SECONDS = 10

/**
 * Graffiti sizes in bytes
 */
export const GRAFFITI_SIZE = 32

/*
 * A ratio of blocks per year that represents an approximation of how many blocks are considered a "year".
 * It's generally an approximation based on TARGET_BLOCK_TIME_IN_SECONDS second block times.
 * It's used in calculating how much a miner should get in rewards.
 */
export const IRON_FISH_YEAR_IN_BLOCKS = (365 * 24 * 60 * 60) / TARGET_BLOCK_TIME_IN_SECONDS
