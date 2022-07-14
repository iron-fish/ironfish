/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { FileSystem } from '../fileSystems'
import { KeyStore } from './keyStore'

export const DEFAULT_CONFIG_NAME = 'config.json'
export const DEFAULT_DATABASE_NAME = 'default'
export const DEFAULT_DATA_DIR = '~/.ironfish'
export const DEFAULT_WALLET_NAME = 'default'
export const DEFAULT_WEBSOCKET_PORT = 9033
export const DEFAULT_GET_FUNDS_API = 'https://api.ironfish.network/faucet_transactions'
export const DEFAULT_TELEMETRY_API = 'https://api.ironfish.network/telemetry'
export const DEFAULT_BOOTSTRAP_NODE = 'test.bn1.ironfish.network'
export const DEFAULT_DISCORD_INVITE = 'https://discord.gg/ironfish'
export const DEFAULT_SNAPSHOT_BUCKET_URL =
  'https://ironfish-snapshots.s3.us-east-1.amazonaws.com'
export const DEFAULT_USE_RPC_IPC = true
export const DEFAULT_USE_RPC_TCP = false
export const DEFAULT_USE_RPC_TLS = true
export const DEFAULT_MINER_BATCH_SIZE = 25000
export const DEFAULT_EXPLORER_BLOCKS_URL = 'https://explorer.ironfish.network/blocks/'
export const DEFAULT_EXPLORER_TRANSACTIONS_URL =
  'https://explorer.ironfish.network/transaction/'

// Pool defaults
export const DEFAULT_POOL_NAME = 'Iron Fish Pool'
export const DEFAULT_POOL_ACCOUNT_NAME = 'default'
export const DEFAULT_POOL_BALANCE_PERCENT_PAYOUT = 10
export const DEFAULT_POOL_HOST = '0.0.0.0'
export const DEFAULT_POOL_PORT = 9034
export const DEFAULT_POOL_DIFFICULTY = '15000000000'
export const DEFAULT_POOL_ATTEMPT_PAYOUT_INTERVAL = 15 * 60 // 15 minutes
export const DEFAULT_POOL_SUCCESSFUL_PAYOUT_INTERVAL = 2 * 60 * 60 // 2 hours
export const DEFAULT_POOL_STATUS_NOTIFICATION_INTERVAL = 30 * 60 // 30 minutes
export const DEFAULT_POOL_RECENT_SHARE_CUTOFF = 2 * 60 * 60 // 2 hours

export type ConfigOptions = {
  bootstrapNodes: string[]
  databaseName: string
  editor: string
  enableListenP2P: boolean
  enableLogFile: boolean
  enableRpc: boolean
  enableRpcIpc: boolean
  enableRpcTcp: boolean
  enableRpcTls: boolean
  enableSyncing: boolean
  enableTelemetry: boolean
  enableMetrics: boolean
  getFundsApi: string
  ipcPath: string
  /**
   * Should the mining director mine, even if we are not synced?
   * Only useful if no miner has been on the network in a long time
   * otherwise you should not turn this on or you'll create useless
   * forks while you sync.
   */
  miningForce: boolean
  /**
   * If true, track all sent and received network messages per-peer.
   */
  logPeerMessages: boolean
  /**
   * Log levels are formatted like so:
   * `*:warn,tag:info`
   *
   * ex: `warn` or `*:warn` displays only logs that are warns or errors.
   *
   * ex: `*:warn,peernetwork:info` displays warns and errors, as well as info
   *     logs from peernetwork and its submodules.
   */
  logLevel: string
  /**
   * String to be prefixed to all logs. Accepts the following replacements:
   * %time% : The time of the log
   * %tag% : The tags on the log
   * %level% : The log level
   *
   * ex: `[%time%] [%level%] [%tag%]`
   */
  logPrefix: string
  /**
   * When mining new blocks, blockGraffiti will be set on the `graffiti` field of
   * newly created blocks.
   * Length is truncated to 32 bytes.
   */
  blockGraffiti: string
  nodeName: string
  /**
   * The number of CPU workers to use for long-running node operations, like creating
   * transactions and verifying blocks. 0 disables workers (this is likely to cause
   * performance issues), and -1 auto-detects based on the number of CPU cores.
   * Each worker uses several hundred MB of memory, so try a lower value to reduce memory
   * consumption.
   */
  nodeWorkers: number
  /**
   * The max number of node workers. See config "nodeWorkers"
   */
  nodeWorkersMax: number
  p2pSimulateLatency: number
  peerPort: number
  rpcTcpHost: string
  rpcTcpPort: number
  rpcTcpSecure: boolean
  tlsKeyPath: string
  tlsCertPath: string
  /**
   * The maximum number of peers we can be connected to at a time. Past this number,
   * new connections will be rejected.
   */
  maxPeers: number
  minPeers: number
  /**
   * The ideal number of peers we'd like to be connected to. The node will attempt to
   * establish new connections when below this number.
   */
  targetPeers: number
  telemetryApi: string
  accountName: string

  /**
   * When the option is true, then each invocation of start command will invoke generation of new identity.
   * In situation, when the option is false, the app check if identity already exists in internal.json file,
   * if exists then will use it, otherwise will generate new.
   */
  generateNewIdentity: boolean

  /**
   * The default delta of block sequence for which to expire transactions from the
   * mempool.
   */
  defaultTransactionExpirationSequenceDelta: number

  /**
   * The default number of blocks to request per message when syncing.
   */
  blocksPerMessage: number

  /**
   * The number of hashes processed by miner per worker request.
   */
  minerBatchSize: number

  /**
   * The minimum number of block confirmations needed when computing account
   * balance.
   */
  minimumBlockConfirmations: number

  /**
   * The name that the pool will use in block graffiti and transaction memo.
   */
  poolName: string

  /**
   * The name of the account that the pool will use to payout from.
   */
  poolAccountName: string

  /**
   * Should pool clients be banned for perceived bad behavior
   */
  poolBanning: boolean

  /**
   * The percent of the confirmed balance of the pool's account that it will payout
   */
  poolBalancePercentPayout: number

  /**
   * The host that the pool is listening for miner connections on.
   */
  poolHost: string

  /**
   * The port that the pool is listening for miner connections on.
   */
  poolPort: number

  /**
   * The pool difficulty, which determines how often miners submit shares.
   */
  poolDifficulty: string

  /**
   * The length of time in seconds that the pool will wait between checking if it is time to make a payout.
   */
  poolAttemptPayoutInterval: number

  /**
   * The length of time in seconds that the pool will wait between successful payouts.
   */
  poolSuccessfulPayoutInterval: number

  /**
   * The length of time in seconds that the pool will wait between status
   * messages. Setting to 0 disables status messages.
   */
  poolStatusNotificationInterval: number

  /**
   * The length of time in seconds that will be used to calculate hashrate for the pool.
   */
  poolRecentShareCutoff: number

  /**
   * The discord webhook URL to post pool critical pool information to
   */
  poolDiscordWebhook: ''

  /**
   * The maximum number of concurrent open connections per remote address.
   * Setting this to 0 disabled the limit
   */
  poolMaxConnectionsPerIp: number

  /**

   * The lark webhook URL to post pool critical pool information to
   */
  poolLarkWebhook: ''

  /**
   * Whether we want the logs to the console to be in JSON format or not. This can be used to log to
   * more easily process logs on a remote server using a log service like Datadog
   */
  jsonLogs: boolean

  /**
   * URL for viewing block information in a block explorer
   */
  explorerBlocksUrl: string

  /**
   * URL for viewing transaction information in a block explorer
   */
  explorerTransactionsUrl: string
}

export const ConfigOptionsSchema: yup.ObjectSchema<Partial<ConfigOptions>> = yup
  .object()
  .shape({})
  .defined()

export class Config extends KeyStore<ConfigOptions> {
  constructor(files: FileSystem, dataDir: string, configName?: string) {
    super(
      files,
      configName || DEFAULT_CONFIG_NAME,
      Config.GetDefaults(files, dataDir),
      dataDir,
      ConfigOptionsSchema,
    )
  }

  get chainDatabasePath(): string {
    return this.files.join(this.storage.dataDir, 'databases', this.get('databaseName'))
  }

  get accountDatabasePath(): string {
    return this.files.join(this.storage.dataDir, 'accounts', this.get('accountName'))
  }

  get indexDatabasePath(): string {
    return this.files.join(this.storage.dataDir, 'indexes', this.get('databaseName'))
  }

  static GetDefaults(files: FileSystem, dataDir: string): ConfigOptions {
    return {
      bootstrapNodes: [DEFAULT_BOOTSTRAP_NODE],
      databaseName: DEFAULT_DATABASE_NAME,
      defaultTransactionExpirationSequenceDelta: 15,
      editor: '',
      enableListenP2P: true,
      enableLogFile: false,
      enableRpc: true,
      enableRpcIpc: DEFAULT_USE_RPC_IPC,
      enableRpcTcp: DEFAULT_USE_RPC_TCP,
      enableRpcTls: DEFAULT_USE_RPC_TLS,
      enableSyncing: true,
      enableTelemetry: false,
      enableMetrics: true,
      getFundsApi: DEFAULT_GET_FUNDS_API,
      ipcPath: files.resolve(files.join(dataDir, 'ironfish.ipc')),
      logLevel: '*:info',
      logPeerMessages: false,
      logPrefix: '',
      miningForce: false,
      blockGraffiti: '',
      nodeName: '',
      nodeWorkers: -1,
      nodeWorkersMax: 6,
      p2pSimulateLatency: 0,
      peerPort: DEFAULT_WEBSOCKET_PORT,
      rpcTcpHost: 'localhost',
      rpcTcpPort: 8020,
      rpcTcpSecure: false,
      tlsKeyPath: files.resolve(files.join(dataDir, 'certs', 'node-key.pem')),
      tlsCertPath: files.resolve(files.join(dataDir, 'certs', 'node-cert.pem')),
      maxPeers: 50,
      minimumBlockConfirmations: 12,
      minPeers: 1,
      targetPeers: 50,
      telemetryApi: DEFAULT_TELEMETRY_API,
      accountName: DEFAULT_WALLET_NAME,
      generateNewIdentity: false,
      blocksPerMessage: 20,
      minerBatchSize: DEFAULT_MINER_BATCH_SIZE,
      poolName: DEFAULT_POOL_NAME,
      poolAccountName: DEFAULT_POOL_ACCOUNT_NAME,
      poolBanning: true,
      poolBalancePercentPayout: DEFAULT_POOL_BALANCE_PERCENT_PAYOUT,
      poolHost: DEFAULT_POOL_HOST,
      poolPort: DEFAULT_POOL_PORT,
      poolDifficulty: DEFAULT_POOL_DIFFICULTY,
      poolAttemptPayoutInterval: DEFAULT_POOL_ATTEMPT_PAYOUT_INTERVAL,
      poolSuccessfulPayoutInterval: DEFAULT_POOL_SUCCESSFUL_PAYOUT_INTERVAL,
      poolStatusNotificationInterval: DEFAULT_POOL_STATUS_NOTIFICATION_INTERVAL,
      poolRecentShareCutoff: DEFAULT_POOL_RECENT_SHARE_CUTOFF,
      poolDiscordWebhook: '',
      poolMaxConnectionsPerIp: 0,
      poolLarkWebhook: '',
      jsonLogs: false,
      explorerBlocksUrl: DEFAULT_EXPLORER_BLOCKS_URL,
      explorerTransactionsUrl: DEFAULT_EXPLORER_TRANSACTIONS_URL,
    }
  }
}
