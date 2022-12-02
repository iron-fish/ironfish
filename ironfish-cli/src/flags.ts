/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_CONFIG_NAME,
  DEFAULT_DATA_DIR,
  DEFAULT_USE_RPC_IPC,
  DEFAULT_USE_RPC_TCP,
  DEFAULT_USE_RPC_TLS,
} from '@ironfish/sdk'
import { Flags, Interfaces } from '@oclif/core'

type CompletableOptionFlag = Interfaces.CompletableOptionFlag<unknown>

export const VerboseFlagKey = 'verbose'
export const ConfigFlagKey = 'config'
export const ColorFlagKey = 'color'
export const DataDirFlagKey = 'datadir'
export const RpcUseIpcFlagKey = 'rpc.ipc'
export const RpcUseTcpFlagKey = 'rpc.tcp'
export const RpcTcpHostFlagKey = 'rpc.tcp.host'
export const RpcTcpPortFlagKey = 'rpc.tcp.port'
export const RpcTcpTlsFlagKey = 'rpc.tcp.tls'
export const RpcAuthFlagKey = 'rpc.auth'

export const VerboseFlag = Flags.boolean({
  char: 'v',
  default: false,
  description: 'Set logging level to verbose',
})

export const ColorFlag = Flags.boolean({
  default: true,
  allowNo: true,
  description: 'Should colorize the output',
})

export const ConfigFlag = Flags.string({
  default: DEFAULT_CONFIG_NAME,
  description: 'The name of the config file to use',
})

export const DataDirFlag = Flags.string({
  default: DEFAULT_DATA_DIR,
  description: 'The path to the data dir',
  env: 'IRONFISH_DATA_DIR',
})

export const RpcUseIpcFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_IPC,
  description: 'Connect to the RPC over IPC (default)',
})

export const RpcUseTcpFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_TCP,
  description: 'Connect to the RPC over TCP',
})

export const RpcTcpHostFlag = Flags.string({
  description: 'The TCP host to listen for connections on',
})

export const RpcTcpPortFlag = Flags.integer({
  description: 'The TCP port to listen for connections on',
})

export const RpcTcpTlsFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_TLS,
  description: 'Encrypt TCP connection to the RPC over TLS',
  allowNo: true,
})

export const RpcAuthFlag = Flags.string({
  description: 'The RPC auth token',
})

const localFlags: Record<string, CompletableOptionFlag> = {}
localFlags[VerboseFlagKey] = VerboseFlag as unknown as CompletableOptionFlag
localFlags[ConfigFlagKey] = ConfigFlag as unknown as CompletableOptionFlag
localFlags[DataDirFlagKey] = DataDirFlag as unknown as CompletableOptionFlag

/**
 * These flags should usually be used on any command that starts a node,
 * or uses a database to execute the command
 */
export const LocalFlags = localFlags

const remoteFlags: Record<string, CompletableOptionFlag> = {}
remoteFlags[VerboseFlagKey] = VerboseFlag as unknown as CompletableOptionFlag
remoteFlags[ConfigFlagKey] = ConfigFlag as unknown as CompletableOptionFlag
remoteFlags[DataDirFlagKey] = DataDirFlag as unknown as CompletableOptionFlag
remoteFlags[RpcUseTcpFlagKey] = RpcUseTcpFlag as unknown as CompletableOptionFlag
remoteFlags[RpcUseIpcFlagKey] = RpcUseIpcFlag as unknown as CompletableOptionFlag
remoteFlags[RpcTcpHostFlagKey] = RpcTcpHostFlag as unknown as CompletableOptionFlag
remoteFlags[RpcTcpPortFlagKey] = RpcTcpPortFlag as unknown as CompletableOptionFlag
remoteFlags[RpcTcpTlsFlagKey] = RpcTcpTlsFlag as unknown as CompletableOptionFlag
remoteFlags[RpcAuthFlagKey] = RpcAuthFlag as unknown as CompletableOptionFlag

/**
 * These flags should usually be used on any command that uses an
 * RPC client to connect to a node to run the command
 */
export const RemoteFlags = remoteFlags
