/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ConfigOptions,
  createRootLogger,
  DatabaseVersionError,
  ErrorUtils,
  InternalOptions,
  IronfishSdk,
  Logger,
  RpcClient,
  RpcConnectionError,
} from '@ironfish/sdk'
import { Command, Config, ux } from '@oclif/core'
import { CLIError, ExitError } from '@oclif/core/errors'
import {
  ConfigFlag,
  ConfigFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  RpcAuthFlagKey,
  RpcHttpHostFlagKey,
  RpcHttpPortFlagKey,
  RpcTcpHostFlagKey,
  RpcTcpPortFlagKey,
  RpcTcpTlsFlag,
  RpcTcpTlsFlagKey,
  RpcUseHttpFlag,
  RpcUseHttpFlagKey,
  RpcUseIpcFlag,
  RpcUseIpcFlagKey,
  RpcUseTcpFlag,
  RpcUseTcpFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from './flags'
import { IronfishCliPKG } from './package'
import * as ui from './ui'
import { hasUserResponseError } from './utils'

export type SIGNALS = 'SIGTERM' | 'SIGINT' | 'SIGUSR2'

export type FLAGS =
  | typeof DataDirFlagKey
  | typeof ConfigFlagKey
  | typeof RpcUseIpcFlagKey
  | typeof RpcUseTcpFlagKey
  | typeof RpcTcpHostFlagKey
  | typeof RpcTcpPortFlagKey
  | typeof RpcUseHttpFlagKey
  | typeof RpcHttpHostFlagKey
  | typeof RpcHttpPortFlagKey
  | typeof RpcTcpTlsFlagKey
  | typeof VerboseFlagKey
  | typeof RpcAuthFlagKey

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

  client: RpcClient | null = null

  public static baseFlags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  constructor(argv: string[], config: Config) {
    super(argv, config)
    this.logger = createRootLogger().withTag(this.ctor.id)
  }

  abstract start(): Promise<unknown> | void

  async run(): Promise<unknown> {
    try {
      return await this.start()
    } catch (error: unknown) {
      if (hasUserResponseError(error)) {
        this.log(error.codeMessage)

        if (error.codeStack) {
          this.sdk.logger.debug(error.codeStack)
        }

        this.exit(1)
      } else if (error instanceof ExitError) {
        throw error
      } else if (error instanceof CLIError) {
        throw error
      } else if (error instanceof RpcConnectionError) {
        this.log(`Cannot connect to your node, start your node first.`)
      } else if (error instanceof DatabaseVersionError) {
        this.log(error.message)
        this.exit(1)
      } else if (error instanceof Error) {
        // eslint-disable-next-line no-console
        console.error(ErrorUtils.renderError(error, true))
        this.exit(1)
      } else {
        throw error
      }
    } finally {
      this.client?.close()
    }

    this.exit(0)
  }

  async init(): Promise<void> {
    const { flags } = await this.parse(this.ctor)

    // Get the flags from the flag object which is unknown
    const dataDirFlag = getFlag(flags, DataDirFlagKey)
    const configFlag = getFlag(flags, ConfigFlagKey)

    const configOverrides: Partial<ConfigOptions> = {}
    const internalOverrides: Partial<InternalOptions> = {}

    const rpcConnectIpcFlag = getFlag(flags, RpcUseIpcFlagKey)
    if (typeof rpcConnectIpcFlag === 'boolean' && rpcConnectIpcFlag !== RpcUseIpcFlag.default) {
      configOverrides.enableRpcIpc = rpcConnectIpcFlag
    }

    const rpcConnectTcpFlag = getFlag(flags, RpcUseTcpFlagKey)
    if (typeof rpcConnectTcpFlag === 'boolean' && rpcConnectTcpFlag !== RpcUseTcpFlag.default) {
      configOverrides.enableRpcTcp = rpcConnectTcpFlag
    }

    const rpcTcpHostFlag = getFlag(flags, RpcTcpHostFlagKey)
    if (typeof rpcTcpHostFlag === 'string') {
      configOverrides.rpcTcpHost = rpcTcpHostFlag
      configOverrides.enableRpcTcp = true
    }

    const rpcTcpPortFlag = getFlag(flags, RpcTcpPortFlagKey)
    if (typeof rpcTcpPortFlag === 'number') {
      configOverrides.rpcTcpPort = rpcTcpPortFlag
      configOverrides.enableRpcTcp = true
    }

    const rpcConnectHttpFlag = getFlag(flags, RpcUseHttpFlagKey)
    if (
      typeof rpcConnectHttpFlag === 'boolean' &&
      rpcConnectHttpFlag !== RpcUseHttpFlag.default
    ) {
      configOverrides.enableRpcHttp = rpcConnectHttpFlag
    }

    const rpcHttpHostFlag = getFlag(flags, RpcHttpHostFlagKey)
    if (typeof rpcHttpHostFlag === 'string') {
      configOverrides.rpcHttpHost = rpcHttpHostFlag
      configOverrides.enableRpcHttp = true
    }

    const rpcHttpPortFlag = getFlag(flags, RpcHttpPortFlagKey)
    if (typeof rpcHttpPortFlag === 'number') {
      configOverrides.rpcHttpPort = rpcHttpPortFlag
      configOverrides.enableRpcHttp = true
    }

    const rpcTcpTlsFlag = getFlag(flags, RpcTcpTlsFlagKey)
    if (typeof rpcTcpTlsFlag === 'boolean' && rpcTcpTlsFlag !== RpcTcpTlsFlag.default) {
      configOverrides.enableRpcTls = rpcTcpTlsFlag
    }

    const verboseFlag = getFlag(flags, VerboseFlagKey)
    if (typeof verboseFlag === 'boolean' && verboseFlag !== VerboseFlag.default) {
      configOverrides.logLevel = '*:verbose'
    }

    const rpcAuthFlag = getFlag(flags, RpcAuthFlagKey)
    if (typeof rpcAuthFlag === 'string') {
      internalOverrides.rpcAuthToken = rpcAuthFlag
    }

    this.sdk = await IronfishSdk.init({
      pkg: IronfishCliPKG,
      configOverrides: configOverrides,
      internalOverrides: internalOverrides,
      configName: typeof configFlag === 'string' ? configFlag : undefined,
      dataDir: typeof dataDirFlag === 'string' ? dataDirFlag : undefined,
      logger: this.logger,
    })
  }

  listenForSignals(): void {
    const signals: SIGNALS[] = ['SIGINT', 'SIGTERM', 'SIGUSR2']

    for (const signal of signals) {
      const gracefulShutdown = (signal: NodeJS.Signals) => {
        if (this.closing) {
          return
        }

        // Allow 3 seconds for graceful termination
        setTimeout(() => {
          this.log('Force closing after 3 seconds')
          process.exit(1)
        }, 3000).unref()

        this.closing = true
        const promise = this.closeFromSignal(signal).catch((err) => {
          this.logger.error(`Failed to close ${ErrorUtils.renderError(err)}`)
        })

        void promise.then(() => {
          process.exit(0)
        })
      }

      process.once(signal, gracefulShutdown)
    }
  }

  closeFromSignal(signal: NodeJS.Signals): Promise<unknown> {
    throw new Error(`Not implemented closeFromSignal: ${signal}`)
  }

  // Override the built-in logJson method to implement our own colorizer that
  // works with default terminal colors instead of requiring a theme to be
  // configured.
  logJson(json: unknown): void {
    ux.stdout(ui.json(json))
  }

  async connectRpc(forceLocal = false, forceRemote = false): Promise<RpcClient> {
    const client = await this.sdk.connectRpc(forceLocal, forceRemote)
    this.client = client
    return client
  }
}

function getFlag(flags: unknown, flag: FLAGS): unknown {
  return typeof flags === 'object' && flags !== null && flag in flags
    ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      (flags as any)[flag]
    : null
}
