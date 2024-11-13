/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  CurrencyUtils,
  DecimalUtils,
  DEFAULT_CONFIG_NAME,
  DEFAULT_DATA_DIR,
  DEFAULT_USE_RPC_HTTP,
  DEFAULT_USE_RPC_IPC,
  DEFAULT_USE_RPC_TCP,
  DEFAULT_USE_RPC_TLS,
  LanguageKey,
  MAXIMUM_ORE_AMOUNT,
  MINIMUM_ORE_AMOUNT,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'

export const VerboseFlagKey = 'verbose'
export const ConfigFlagKey = 'config'
export const JsonFlagKey = 'json'
export const ColorFlagKey = 'color'
export const DataDirFlagKey = 'datadir'
export const RpcUseIpcFlagKey = 'rpc.ipc'
export const RpcUseTcpFlagKey = 'rpc.tcp'
export const RpcTcpHostFlagKey = 'rpc.tcp.host'
export const RpcTcpPortFlagKey = 'rpc.tcp.port'
export const RpcUseHttpFlagKey = 'rpc.http'
export const RpcHttpHostFlagKey = 'rpc.http.host'
export const RpcHttpPortFlagKey = 'rpc.http.port'
export const RpcTcpTlsFlagKey = 'rpc.tcp.tls'
export const RpcAuthFlagKey = 'rpc.auth'

export const VerboseFlag = Flags.boolean({
  char: 'v',
  default: false,
  description: 'Set logging level to verbose',
  helpGroup: 'GLOBAL',
})

export const JsonFlag = Flags.boolean({
  default: false,
  description: 'format output as json',
  helpGroup: 'OUTPUT',
})

export const ColorFlag = Flags.boolean({
  default: true,
  allowNo: true,
  description: 'Should colorize the output',
  helpGroup: 'OUTPUT',
})

export const ConfigFlag = Flags.string({
  default: DEFAULT_CONFIG_NAME,
  description: 'The name of the config file to use',
  helpGroup: 'GLOBAL',
})

export const DataDirFlag = Flags.string({
  char: 'd',
  default: DEFAULT_DATA_DIR,
  description: 'The path to the data dir',
  env: 'IRONFISH_DATA_DIR',
  helpGroup: 'GLOBAL',
})

export const RpcUseIpcFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_IPC,
  description: 'Connect to the RPC over IPC (default)',
  helpGroup: 'RPC',
})

export const RpcUseTcpFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_TCP,
  description: 'Connect to the RPC over TCP',
  helpGroup: 'RPC',
})

export const RpcTcpHostFlag = Flags.string({
  description: 'The TCP host to listen for connections on',
  helpGroup: 'RPC',
})

export const RpcTcpPortFlag = Flags.integer({
  description: 'The TCP port to listen for connections on',
  helpGroup: 'RPC',
})

export const RpcTcpTlsFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_TLS,
  description: 'Encrypt TCP connection to the RPC over TLS',
  allowNo: true,
  helpGroup: 'RPC',
})

export const RpcAuthFlag = Flags.string({
  description: 'The RPC auth token',
  helpGroup: 'RPC',
})

export const RpcHttpHostFlag = Flags.string({
  description: 'The HTTP host to listen for connections on',
  helpGroup: 'RPC',
})

export const RpcHttpPortFlag = Flags.integer({
  description: 'The HTTP port to listen for connections on',
  helpGroup: 'RPC',
})

export const RpcUseHttpFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_HTTP,
  description: 'Connect to the RPC over HTTP',
  allowNo: true,
  helpGroup: 'RPC',
})

/**
 * These flags should usually be used on any command that uses an
 * RPC client to connect to a node to run the command
 */
export const RemoteFlags = {
  [RpcUseTcpFlagKey]: RpcUseTcpFlag,
  [RpcUseIpcFlagKey]: RpcUseIpcFlag,
  [RpcTcpHostFlagKey]: RpcTcpHostFlag,
  [RpcTcpPortFlagKey]: RpcTcpPortFlag,
  [RpcHttpHostFlagKey]: RpcHttpHostFlag,
  [RpcHttpPortFlagKey]: RpcHttpPortFlag,
  [RpcUseHttpFlagKey]: RpcUseHttpFlag,
  [RpcTcpTlsFlagKey]: RpcTcpTlsFlag,
  [RpcAuthFlagKey]: RpcAuthFlag,
}

/**
 * Flags to include if your command returns JSON
 * you must also use enableJsonFlag = true
 */
export const JsonFlags = {
  [JsonFlagKey]: JsonFlag,
  [ColorFlagKey]: ColorFlag,
}

export type IronOpts = { minimum?: bigint; flagName: string }

export const IronFlag = Flags.custom<bigint, IronOpts>({
  parse: async (input, _ctx, opts) => parseIron(input, opts),
  char: 'i',
})

export const parseIron = (input: string, opts: IronOpts): Promise<bigint> => {
  return new Promise((resolve, reject) => {
    const { minimum, flagName } = opts ?? {}
    try {
      const value = CurrencyUtils.decodeIron(input)

      if (minimum !== undefined && value < minimum) {
        reject(
          new Error(`The minimum ${flagName} is ${CurrencyUtils.renderOre(minimum, true)}`),
        )
      }

      if (value < MINIMUM_ORE_AMOUNT || value > MAXIMUM_ORE_AMOUNT) {
        reject(new Error(`The number inputted for ${flagName} is invalid.`))
      }

      resolve(value)
    } catch {
      reject(new Error(`The number inputted for ${flagName} is invalid.`))
    }
  })
}

/**
 * A flag used for a value when we do not yet know how to treat the conversion
 * from major to minor denomination. Parses the value simply as a valid number,
 * to be converted later manually.
 */
export const ValueFlag = Flags.custom<string>({
  parse: async (input, _ctx, opts) => {
    return new Promise((resolve, reject) => {
      try {
        DecimalUtils.tryDecode(input)
        resolve(input)
      } catch (e) {
        reject(new Error(`The number inputted for ${opts.name} is invalid.`))
      }
    })
  },
})

export const HexFlag = Flags.custom<string>({
  parse: async (input, _ctx, opts) => {
    const hexRegex = /^[0-9A-Fa-f]+$/g
    if (!hexRegex.test(input)) {
      throw new Error(
        `The value provided for ${opts.name} is an invalid format. It must be a hex string.`,
      )
    }

    return Promise.resolve(input)
  },
})

export const EnumLanguageKeyFlag = Flags.custom<LanguageKey, { choices: Array<LanguageKey> }>({
  parse: async (input, _ctx, opts) => {
    const parsed = opts.choices.find((valid) => valid.toLowerCase() === input.toLowerCase())
    if (parsed) {
      return Promise.resolve(parsed)
    } else {
      return Promise.reject(new Error(`Invalid choice: ${input}`))
    }
  },
})

export const DateFlag = Flags.custom<Date>({
  parse: async (input, _ctx, opts) => {
    const parsed = new Date(input)

    if (Number.isNaN(parsed.valueOf())) {
      throw new Error(
        `The value provided for ${opts.name} is an invalid format. It must be a valid date.`,
      )
    }

    return Promise.resolve(parsed)
  },
})
