/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NetworkIdentifier } from '../types'

/**
 * Blockchains specific config
 * */
export const BlockchainName = 'Iron Fish'
export const NetworkStage = process.env.IRF_NETWORK || 'testnet'

export const networkIdentifier: NetworkIdentifier = {
  blockchain: BlockchainName,
  network: NetworkStage,
}

/**
 * Server specific config
 * */
export const SERVER_PORT = 8080
export const API_HOST = process.env.CLIENT_HOST || 'https://explorer.ironfish.network'

/**
 * Database specific config
 * */
export const DATABASE_HOST = process.env.DATABASE_HOST || 'localhost'
export const DATABASE_PORT = process.env.DATABASE_PORT || 5432
export const DATABASE_USERNAME = process.env.DATABASE_USERNAME || 'postgres'
export const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || ''
export const DATABASE_BASE = process.env.DATABASE_BASE || 'rosetta'

/**
 * RPC Config
 * */
export const RPC_MODE = (process.env.RPC_MODE as 'tcp' | 'ipc') || 'tcp'
export const RPC_HOST = process.env.RPC_HOST || '0.0.0.0'
export const RPC_PORT = process.env.RPC_PORT || 8021
