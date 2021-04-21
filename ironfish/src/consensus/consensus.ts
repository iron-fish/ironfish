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
 * The sequence of the gensis block starts at 1
 */
export const GENESIS_BLOCK_SEQUENCE = BigInt(1)

/**
 * When adding a block, the block can be this amount of seconds into the future
 * without rejecting it
 */
export const ALLOWED_BLOCK_FUTURE_SECONDS = 15

/**
 * The amount of coins in the genesis block
 */
export const GENESIS_SUPPLY_IN_IRON = 42000000

/*
 * A ratio of blocks per year that represetnts an approximation of how many blocks are considered a "year".
 * It's generally an approximation based on 15 second block times. It's used in calculating how much a miner
 * should get in rewards.
 */
export const IRON_FISH_YEAR_IN_BLOCKS = 2100000

/**
 * The oldest the tip should be before we consider the chain synced
 */
export const MAX_SYNCED_AGE_MS = 60 * 1000
