/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import net from 'net'
import { Event } from '../../event'
import { Config } from '../../fileStores/config'
import { createRootLogger, Logger } from '../../logger'
import { SetTimeoutToken } from '../../utils'
import { DisconnectReason } from './constants'
import { StratumServer } from './stratumServer'
import { StratumServerClient } from './stratumServerClient'

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000
const PEERS_TICK_MS = 10000

export class StratumPeers {
  readonly logger: Logger
  readonly maxConnectionsByIp: number
  readonly server: StratumServer

  readonly onBanned = new Event<[StratumServerClient]>()

  banCount = 0

  protected readonly connectionsByIp: Map<string, number> = new Map()
  protected readonly bannedByIp: Map<string, number> = new Map()
  protected readonly scoreByIp: Map<string, number> = new Map()
  protected readonly shadowBans: Set<number> = new Set()
  protected eventLoopTimeout: SetTimeoutToken | null = null

  constructor(options: {
    maxConnectionsPerIp?: number
    config: Config
    logger?: Logger
    banning?: boolean
    server: StratumServer
  }) {
    this.logger = options.logger ?? createRootLogger()
    this.server = options.server

    this.maxConnectionsByIp =
      options.maxConnectionsPerIp ?? options.config.get('poolMaxConnectionsPerIp')
  }

  start(): void {
    this.eventLoop()
  }

  stop(): void {
    if (this.eventLoopTimeout) {
      clearTimeout(this.eventLoopTimeout)
    }
  }

  punish(client: StratumServerClient, message?: string, amount = 1): void {
    if (this.isBanned(client.socket)) {
      return
    }

    let banScore = this.scoreByIp.get(client.remoteAddress) ?? 0
    banScore += amount

    if (banScore < 10) {
      this.scoreByIp.set(client.remoteAddress, banScore)
      return
    }

    this.ban(client, { message })
    this.scoreByIp.delete(client.remoteAddress)
  }

  shadowBan(client: StratumServerClient): void {
    this.shadowBans.add(client.id)
  }

  ban(
    client: StratumServerClient,
    options?: {
      reason?: DisconnectReason
      message?: string
      until?: number
      versionExpected?: number
    },
  ): void {
    let until = options?.until ?? Date.now() + FIFTEEN_MINUTES_MS

    // Prefer an existing longer ban
    const existing = this.bannedByIp.get(client.remoteAddress) ?? 0
    until = Math.max(existing, until)

    this.bannedByIp.set(client.remoteAddress, until)
    this.scoreByIp.delete(client.remoteAddress)
    this.banCount++

    this.server.send(client, 'mining.disconnect', {
      reason: options?.reason ?? DisconnectReason.UNKNOWN,
      versionExpected: options?.versionExpected,
      bannedUntil: until,
      message: options?.message,
    })

    client.close()
    this.onBanned.emit(client)

    this.logger.info(
      `Banned ${client.remoteAddress}: ${
        options?.message ?? options?.reason ?? 'unknown'
      } until: ${new Date(until).toUTCString()} (${this.banCount} bans)`,
    )
  }

  isShadowBanned(client: StratumServerClient): boolean {
    return this.shadowBans.has(client.id)
  }

  isBanned(socket: net.Socket): boolean {
    if (!socket.remoteAddress) {
      return false
    }

    const bannedUntil = this.bannedByIp.get(socket.remoteAddress)
    if (!bannedUntil) {
      return false
    }

    return bannedUntil > Date.now()
  }

  isAllowed(socket: net.Socket): boolean {
    if (!socket.remoteAddress) {
      return false
    }

    if (this.isBanned(socket)) {
      return false
    }

    const connections = this.connectionsByIp.get(socket.remoteAddress) ?? 0
    if (this.maxConnectionsByIp > 0 && connections >= this.maxConnectionsByIp) {
      return false
    }

    return true
  }

  addConnectionCount(client: StratumServerClient): void {
    const count = this.connectionsByIp.get(client.remoteAddress) ?? 0
    this.connectionsByIp.set(client.remoteAddress, count + 1)
  }

  removeConnectionCount(client: StratumServerClient): void {
    const count = this.connectionsByIp.get(client.remoteAddress) ?? 0
    this.connectionsByIp.set(client.remoteAddress, count - 1)

    if (count - 1 <= 0) {
      this.connectionsByIp.delete(client.remoteAddress)
    }

    this.shadowBans.delete(client.id)
  }

  unpunish(remoteAddress: string, reduceBy = 1): void {
    let score = this.scoreByIp.get(remoteAddress)

    if (score === undefined) {
      return
    }

    score -= reduceBy

    if (score > 0) {
      this.scoreByIp.set(remoteAddress, score)
    } else {
      this.scoreByIp.delete(remoteAddress)
    }
  }

  eventLoop(): void {
    for (const remoteAddress of this.scoreByIp.keys()) {
      this.unpunish(remoteAddress)
    }

    this.eventLoopTimeout = setTimeout(() => this.eventLoop(), PEERS_TICK_MS)
  }
}
