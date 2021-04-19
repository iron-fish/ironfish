/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Command } from '@oclif/command'
import { IConfig } from '@oclif/config'
import { createRootLogger, Logger, ConfigOptions, IronfishSdk, ConnectionError } from 'ironfish'
import {
  DataDirFlagKey,
  DatabaseFlagKey,
  ConfigFlagKey,
  RpcUseIpcFlagKey,
  RpcUseTcpFlagKey,
  RpcTcpHostFlagKey,
  RpcTcpPortFlagKey,
  VerboseFlagKey,
} from './flags'
import { hasUserResponseError } from './utils'

export type SIGNALS = 'SIGTERM' | 'SIGINT' | 'SIGUSR2'

export type FLAGS =
  | typeof DataDirFlagKey
  | typeof DatabaseFlagKey
  | typeof ConfigFlagKey
  | typeof RpcUseIpcFlagKey
  | typeof RpcUseTcpFlagKey
  | typeof RpcTcpHostFlagKey
  | typeof RpcTcpPortFlagKey
  | typeof VerboseFlagKey

export abstract class IronfishCommand extends Command {
  // Yes, this is disabling the type system but any code
  // that may use this will not be executed until after
  // run() is called and it provides a lot of value
  sdk!: IronfishSdk

  /**
   * Use this logger instance for debug/error output.
   * Actual command output should use `this.log` instead.
   */
  logger: Logger

  /**
   * Set to true when the command is closing so any async things in the command can interrupt and quit
   */
  closing = false

  constructor(argv: string[], config: IConfig) {
    super(argv, config)
    this.logger = createRootLogger().withTag(this.ctor.id)
  }

  abstract start(): Promise<void> | void

  async run(): Promise<void> {
    try {
      await this.start()
    } catch (error: unknown) {
      if (hasUserResponseError(error)) {
        this.log(error.codeMessage)
      } else if (error instanceof ConnectionError) {
        this.log(`Cannot connect to your node, start your node first.`)
      } else throw error
    }

    this.exit(0)
  }

  async init(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const commandClass = this.constructor as any
    const { flags } = this.parse(commandClass)

    // Get the flags from the flag object which is unknown
    const dataDirFlag = getFlag(flags, DataDirFlagKey)
    const configFlag = getFlag(flags, ConfigFlagKey)

    const configOverrides: Partial<ConfigOptions> = {}

    const databaseNameFlag = getFlag(flags, DatabaseFlagKey)
    if (typeof databaseNameFlag === 'string') {
      configOverrides.databaseName = databaseNameFlag
    }

    const rpcConnectIpcFlag = getFlag(flags, RpcUseIpcFlagKey)
    if (typeof rpcConnectIpcFlag === 'boolean') {
      configOverrides.enableRpcIpc = rpcConnectIpcFlag
    }

    const rpcConnectTcpFlag = getFlag(flags, RpcUseTcpFlagKey)
    if (typeof rpcConnectTcpFlag === 'boolean') {
      configOverrides.enableRpcTcp = rpcConnectTcpFlag
    }

    const rpcTcpHostFlag = getFlag(flags, RpcTcpHostFlagKey)
    if (typeof rpcTcpHostFlag === 'string') {
      configOverrides.rpcTcpHost = rpcTcpHostFlag
    }

    const rpcTcpPortFlag = getFlag(flags, RpcTcpPortFlagKey)
    if (typeof rpcTcpPortFlag === 'number') {
      configOverrides.rpcTcpPort = rpcTcpPortFlag
    }

    const verboseFlag = getFlag(flags, VerboseFlagKey)
    if (typeof verboseFlag === 'boolean' && verboseFlag) {
      configOverrides.logLevel = '*:verbose'
    }

    this.sdk = await IronfishSdk.init({
      agent: 'cli',
      configOverrides: configOverrides,
      configName: typeof configFlag === 'string' ? configFlag : undefined,
      dataDir: typeof dataDirFlag === 'string' ? dataDirFlag : undefined,
      logger: this.logger,
    })
  }

  listenForSignals(): void {
    const signals: SIGNALS[] = ['SIGINT', 'SIGTERM', 'SIGUSR2']

    for (const signal of signals) {
      const gracefulShutdown = (signal: SIGNALS) => {
        process.off(signal, gracefulShutdown)

        // Allow 3 seconds for graceful termination
        setTimeout(() => {
          this.log('Force closing after 3 seconds')
          process.exit(1)
        }, 3000).unref()

        this.closing = true
        const promise = this.closeFromSignal(signal).catch((err) => {
          this.logger.error('Failed to close', err)
        })

        void promise.then(() => {
          process.exit(0)
        })
      }

      process.on(signal, gracefulShutdown.bind(signal))
    }
  }

  closeFromSignal(signal: SIGNALS): Promise<unknown> {
    throw new Error(`Not implemented closeFromSignal: ${signal}`)
  }
}

function getFlag(flags: unknown, flag: FLAGS): unknown | null {
  return typeof flags === 'object' && flags != null && flag in flags
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (flags as any)[flag]
    : null
}
