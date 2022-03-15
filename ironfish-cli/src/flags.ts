/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  DEFAULT_CONFIG_NAME,
  DEFAULT_DATA_DIR,
  DEFAULT_DATABASE_NAME,
  DEFAULT_USE_RPC_IPC,
  DEFAULT_USE_RPC_TCP,
} from '@ironfish/sdk'
import { Flags, Interfaces } from '@oclif/core'

type CompletableOptionFlag = Interfaces.CompletableOptionFlag<unknown>

export const VerboseFlagKey = 'verbose'
export const ConfigFlagKey = 'config'
export const ColorFlagKey = 'color'
export const DataDirFlagKey = 'datadir'
export const DatabaseFlagKey = 'database'
export const RpcUseIpcFlagKey = 'rpc.ipc'
export const RpcUseTcpFlagKey = 'rpc.tcp'
export const RpcTcpHostFlagKey = 'rpc.tcp.host'
export const RpcTcpPortFlagKey = 'rpc.tcp.port'
export const RpcTcpSecureFlagKey = 'rpc.tcp.secure'

export const VerboseFlag = Flags.boolean({
  char: 'v',
  default: false,
  description: 'set logging level to verbose',
})

export const ColorFlag = Flags.boolean({
  default: true,
  allowNo: true,
  description: 'should colorize the output',
})

export const ConfigFlag = Flags.string({
  default: DEFAULT_CONFIG_NAME,
  description: 'the name of the config file to use',
})

export const DataDirFlag = Flags.string({
  default: DEFAULT_DATA_DIR,
  description: 'the path to the data dir',
})

export const DatabaseFlag = Flags.string({
  char: 'd',
  default: DEFAULT_DATABASE_NAME,
  description: 'the name of the database to use',
})

export const RpcUseIpcFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_IPC,
  description: 'connect to the RPC over IPC (default)',
})

export const RpcUseTcpFlag = Flags.boolean({
  default: DEFAULT_USE_RPC_TCP,
  description: 'connect to the RPC over TCP',
})

export const RpcTcpHostFlag = Flags.string({
  description: 'the TCP host to listen for connections on',
})

export const RpcTcpPortFlag = Flags.integer({
  description: 'the TCP port to listen for connections on',
})

export const RpcTcpSecureFlag = Flags.boolean({
  default: false,
  description: 'allow sensitive config to be changed over TCP',
})

const localFlags: Record<string, CompletableOptionFlag> = {}
localFlags[VerboseFlagKey] = VerboseFlag as unknown as CompletableOptionFlag
localFlags[ConfigFlagKey] = ConfigFlag as unknown as CompletableOptionFlag
localFlags[DataDirFlagKey] = DataDirFlag as unknown as CompletableOptionFlag
localFlags[DatabaseFlagKey] = DatabaseFlag as unknown as CompletableOptionFlag

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
remoteFlags[RpcTcpSecureFlagKey] = RpcTcpSecureFlag as unknown as CompletableOptionFlag

/**
 * These flags should usually be used on any command that uses an
 * RPC client to connect to a node to run the command
 */
export const RemoteFlags = remoteFlags
