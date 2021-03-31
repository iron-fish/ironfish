/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Server specific config
 * */
export const SERVER_PORT = 8080

/**
 * Database specific config
 * */
export const DATABASE_HOST = process.env.DATABASE_HOST || 'localhost'
export const DATABASE_PORT = process.env.DATABASE_PORT || 5432
export const DATABASE_USERNAME = process.env.DATABASE_USERNAME || 'postgres'
export const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || ''
export const DATABASE_BASE = process.env.DATABASE_BASE || 'faucet'
export const DATABASE_CONNECTION_STRING = `postgres://${DATABASE_USERNAME}:${DATABASE_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_BASE}`

/**
 * RPC Config
 * */
export const RPC_MODE = (process.env.RPC_MODE as 'tcp' | 'ipc') || 'ipc'
export const RPC_HOST = process.env.RPC_HOST || '0.0.0.0'
export const RPC_PORT = process.env.RPC_PORT || 8021

/**
 * Faucet Config
 * */
export const FAUCET_AMOUNT = process.env.FAUCET_AMOUNT || 1000
export const FAUCET_FEE = process.env.FAUCET_FEE || 1
export const FAUCET_ACCOUNT_NAME = process.env.ACCOUNT_NAME || 'IronFishFaucetAccount'
