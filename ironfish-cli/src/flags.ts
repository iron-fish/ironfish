/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IOptionFlag } from '@oclif/command/lib/flags'
import { DEFAULT_CONFIG_NAME, DEFAULT_DATA_DIR, DEFAULT_DATABASE_NAME } from 'ironfish'

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

export const VerboseFlag = flags.boolean({
  char: 'v',
  default: false,
  description: 'set logging level to verbose',
})

export const ColorFlag = flags.boolean({
  default: true,
  allowNo: true,
  description: 'should colorize the output',
})

export const ConfigFlag = flags.string({
  default: DEFAULT_CONFIG_NAME,
  description: 'the name of the config file to use',
})

export const DataDirFlag = flags.string({
  default: DEFAULT_DATA_DIR,
  description: 'the path to the data dir',
})

export const DatabaseFlag = flags.string({
  char: 'd',
  default: DEFAULT_DATABASE_NAME,
  description: 'the name of the database to use',
})

export const RpcUseIpcFlag = flags.boolean({
  default: true,
  description: 'connect to the RPC over IPC (default)',
})

export const RpcUseTcpFlag = flags.boolean({
  default: false,
  description: 'connect to the RPC over TCP',
})

export const RpcTcpHostFlag = flags.string({
  description: 'the TCP host to listen for connections on',
})

export const RpcTcpPortFlag = flags.integer({
  description: 'the TCP port to listen for connections on',
})

export const RpcTcpSecureFlag = flags.boolean({
  default: false,
  description: 'allow sensitive config to be changed over TCP',
})

const localFlags: Record<string, IOptionFlag<unknown>> = {}
localFlags[VerboseFlagKey] = VerboseFlag as unknown as IOptionFlag<unknown>
localFlags[ConfigFlagKey] = ConfigFlag as unknown as IOptionFlag<unknown>
localFlags[DataDirFlagKey] = DataDirFlag as unknown as IOptionFlag<unknown>
localFlags[DatabaseFlagKey] = DatabaseFlag as unknown as IOptionFlag<unknown>

/**
 * These flags should usually be used on any command that starts a node,
 * or uses a database to execute the command
 */
export const LocalFlags = localFlags

const remoteFlags: Record<string, IOptionFlag<unknown>> = {}
remoteFlags[VerboseFlagKey] = VerboseFlag as unknown as IOptionFlag<unknown>
remoteFlags[ConfigFlagKey] = ConfigFlag as unknown as IOptionFlag<unknown>
remoteFlags[DataDirFlagKey] = DataDirFlag as unknown as IOptionFlag<unknown>
remoteFlags[RpcUseTcpFlagKey] = RpcUseTcpFlag as unknown as IOptionFlag<unknown>
remoteFlags[RpcUseIpcFlagKey] = RpcUseIpcFlag as unknown as IOptionFlag<unknown>
remoteFlags[RpcTcpHostFlagKey] = RpcTcpHostFlag as unknown as IOptionFlag<unknown>
remoteFlags[RpcTcpPortFlagKey] = RpcTcpPortFlag as unknown as IOptionFlag<unknown>
remoteFlags[RpcTcpSecureFlagKey] = RpcTcpSecureFlag as unknown as IOptionFlag<unknown>

/**
 * These flags should usually be used on any command that uses an
 * RPC client to connect to a node to run the command
 */
export const RemoteFlags = remoteFlags
