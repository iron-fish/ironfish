/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { FileSystem } from '../fileSystems'
import { YupUtils } from '../utils'
import { KeyStore } from './keyStore'

export const DEFAULT_CONFIG_NAME = 'config.json'
export const DEFAULT_DATA_DIR = '~/.ironfish'
export const DEFAULT_WEBSOCKET_PORT = 9033
export const DEFAULT_DISCORD_INVITE = 'https://discord.ironfish.network'
export const DEFAULT_USE_RPC_IPC = true
export const DEFAULT_USE_RPC_TCP = false
export const DEFAULT_USE_RPC_TLS = true
// TODO(daniel): Setting this to false until we can get HTTPS + basic auth
export const DEFAULT_USE_RPC_HTTP = false
export const DEFAULT_POOL_HOST = '::'
export const DEFAULT_POOL_PORT = 9034
export const DEFAULT_NETWORK_ID = 1
export const DEFAULT_FEE_ESTIMATOR_MAX_BLOCK_HISTORY = 10
export const DEFAULT_FEE_ESTIMATOR_PERCENTILE_SLOW = 10
export const DEFAULT_FEE_ESTIMATOR_PERCENTILE_AVERAGE = 20
export const DEFAULT_FEE_ESTIMATOR_PERCENTILE_FAST = 30
export const DEFAULT_MAX_PEERS = 50
export const DEFAULT_TARGET_PEERS = 45
export const DEFAULT_KEEP_OPEN_PEER_SLOT = false

const MEGABYTES = 1000 * 1000

export type ConfigOptions = {
  bootstrapNodes: string[]
  /**
   * STUN servers to use for inititating WebRTC connections.
   */
  p2pStunServers: string[]
  databaseMigrate: boolean
  enableWallet: boolean
  editor: string
  enableListenP2P: boolean
  enableLogFile: boolean
  enableRpc: boolean
  enableRpcIpc: boolean
  enableRpcTcp: boolean
  enableRpcTls: boolean
  enableRpcHttp: boolean
  enableSyncing: boolean
  enableTelemetry: boolean
  enableMetrics: boolean
  enableAssetVerification: boolean
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
   * performance issues), and -1 auto-detects an optimal value based on the number of
   * CPU cores (without exceeding `nodeWorkersMax`).
   *
   * Each worker uses several hundred MB of memory, so try a lower value to reduce memory
   * consumption.
   */
  nodeWorkers: number
  /**
   * The max number of node workers. See also `nodeWorkers". If -1, it defaults to the
   * number of CPU cores available to the system (capped at 16).
   *
   * Note that on system with Simultaneous Multithreading (SMT, also known as
   * Hyper-Threading on Intel processors), the number of CPU cores is usually half of the
   * number of virtual CPUs.
   */
  nodeWorkersMax: number
  peerPort: number
  rpcTcpHost: string
  rpcTcpPort: number
  tlsKeyPath: string
  tlsCertPath: string
  rpcHttpHost: string
  rpcHttpPort: number
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
  /**
   * If true, the node will disconnect from a peer if the number of connected
   * peers is equal to maxPeers in order to always allow incoming connections.
   */
  keepOpenPeerSlot: boolean

  telemetryApi: string
  assetVerificationApi: string

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
  transactionExpirationDelta: number

  /**
   * The default number of blocks to request per message when syncing.
   */
  blocksPerMessage: number

  /**
   * The number of hashes processed by miner per worker request.
   */
  minerBatchSize: number

  /*
   * Whether the mining manager should preemptively generate empty block
   * templates, even if there are transactions in the mempool, with the goal of
   * maximizing miner efficiency. This is enabled (true) by default. It may be
   * disabled for testing purposes or when mining is small networks, with a low
   * difficulty.
   */
  preemptiveBlockMining: boolean

  /**
   * The minimum number of block confirmations needed when computing account
   * balance.
   */
  confirmations: number

  /**
   * The name that the pool will use in block graffiti and transaction memo.
   */
  poolName: string

  /**
   * The name of the account that the pool will use to payout from.
   */
  poolAccountName?: string

  /**
   * Should pool clients be banned for perceived bad behavior
   */
  poolBanning: boolean

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
   * The length of time in seconds that the pool will wait between status
   * messages. Setting to 0 disables status messages.
   */
  poolStatusNotificationInterval: number

  /**
   * The length of time in seconds that will be used to calculate hashrate for the pool.
   */
  poolRecentShareCutoff: number

  /**
   * The length of time in seconds for each payout period. This is used to
   * calculate the number of shares and how much they earn per period.
   */
  poolPayoutPeriodDuration: number

  /**
   * The discord webhook URL to post pool critical pool information to
   */
  poolDiscordWebhook: string

  /**
   * The maximum number of concurrent open connections per remote address.
   * Setting this to 0 disabled the limit
   */
  poolMaxConnectionsPerIp: number

  /**
   * The lark webhook URL to post pool critical pool information to
   */
  poolLarkWebhook: string

  /**
   * Extranonce size in bytes for v2 protocol.
   */
  poolXnSize: number

  /**
   * Versions of the ironfish stratum protocol that the pool supports.
   */
  poolSupportedVersions: number[]

  /**
   * Whether we want the logs to the console to be in JSON format or not. This can be used to log to
   * more easily process logs on a remote server using a log service like Datadog
   */
  jsonLogs: boolean

  /**
   * How many blocks back from the head of the chain to use to calculate the fee
   * estimate
   */
  feeEstimatorMaxBlockHistory: number

  /**
   * The percentile to use as an estimate for a slow transaction
   */
  feeEstimatorPercentileSlow: number

  /**
   * The percentile to use as an estimate for an average transaction
   */
  feeEstimatorPercentileAverage: number

  /**
   * The percentile to use as an estimate for a fast transaction
   */
  feeEstimatorPercentileFast: number

  /**
   * The oldest the tip should be before we consider the chain synced
   */
  maxSyncedAgeBlocks: number

  /**
   * Limit the number of bytes of transactions stored in the mempool. Does NOT account for the
   * entire size of the mempool (like indices and caches)
   */
  memPoolMaxSizeBytes: number

  /**
   * Limit how many entries the mempool's recently evicted caches stores. This cache is used to keep
   * track of transaction hashes recently evicted from the mempool after it exceeds mempoolMaxSizeBytes
   */
  memPoolRecentlyEvictedCacheSize: number

  /**
   * Always allow incoming connections from these IPs even if the node is at maxPeers
   */
  incomingWebSocketWhitelist: string[]

  /**
   * When the wallet listens for incoming unconfirmed transactions, limit the
   * number of transactions the wallet can queue up before it starts dropping them.
   */
  walletGossipTransactionsMaxQueueSize: number

  /**
   * The max number of transactions to process at one time when syncing
   */
  walletSyncingMaxQueueSize: number

  /**
   * The max number of blocks that may be processed in parallel when syncing.
   * By default, this number is automatically calculated from the number of
   * workers available (see `nodeWorkers` and `nodeWorkersMax`). You may set
   * this number to limit the memory usage during syncing.
   */
  walletSyncingMaxConcurrency: number

  /**
   * Whether or not to build the full fish hash context at node startup. Setting this
   * to `true` will slightly increase node performance but use ~4.5GB more RAM. The majority of
   * network users will not need this speed increase and so should keep the default of `false`.
   */
  fishHashFullContext: boolean
}

export const ConfigOptionsSchema: yup.ObjectSchema<Partial<ConfigOptions>> = yup
  .object({
    bootstrapNodes: yup.array().of(yup.string().defined()),
    p2pStunServers: yup.array().of(yup.string().defined()),
    databaseMigrate: yup.boolean(),
    enableWallet: yup.boolean(),
    editor: yup.string().trim(),
    enableListenP2P: yup.boolean(),
    enableLogFile: yup.boolean(),
    enableRpc: yup.boolean(),
    enableRpcIpc: yup.boolean(),
    enableRpcTcp: yup.boolean(),
    enableRpcTls: yup.boolean(),
    enableRpcHttp: yup.boolean(),
    enableSyncing: yup.boolean(),
    enableTelemetry: yup.boolean(),
    enableMetrics: yup.boolean(),
    enableAssetVerification: yup.boolean(),
    getFundsApi: yup.string(),
    ipcPath: yup.string().trim(),
    miningForce: yup.boolean(),
    logPeerMessages: yup.boolean(),
    // validated separately by logLevelParser
    logLevel: yup.string(),
    // not applying a regex pattern to avoid getting out of sync with logic
    // to parse logPrefix
    logPrefix: yup.string(),
    blockGraffiti: yup.string(),
    nodeName: yup.string().max(32),
    nodeWorkers: yup.number().integer().min(-1),
    nodeWorkersMax: yup.number().integer().min(-1),
    peerPort: YupUtils.isPort,
    rpcTcpHost: yup.string().trim(),
    rpcTcpPort: YupUtils.isPort,
    tlsKeyPath: yup.string().trim(),
    tlsCertPath: yup.string().trim(),
    rpcHttpHost: yup.string().trim(),
    rpcHttpPort: YupUtils.isPort,
    maxPeers: YupUtils.isPositiveInteger,
    minPeers: YupUtils.isPositiveInteger,
    targetPeers: yup.number().integer().min(1),
    keepOpenPeerSlot: yup.boolean(),
    telemetryApi: yup.string(),
    assetVerificationApi: yup.string(),
    generateNewIdentity: yup.boolean(),
    transactionExpirationDelta: YupUtils.isPositiveInteger,
    blocksPerMessage: YupUtils.isPositiveInteger,
    minerBatchSize: YupUtils.isPositiveInteger,
    preemptiveBlockMining: yup.boolean(),
    confirmations: YupUtils.isPositiveInteger,
    poolName: yup.string(),
    poolAccountName: yup.string().optional(),
    poolBanning: yup.boolean(),
    poolHost: yup.string().trim(),
    poolPort: YupUtils.isPort,
    poolDifficulty: yup.string(),
    poolStatusNotificationInterval: YupUtils.isPositiveInteger,
    poolRecentShareCutoff: YupUtils.isPositiveInteger,
    poolPayoutPeriodDuration: YupUtils.isPositiveInteger,
    poolDiscordWebhook: yup.string(),
    poolMaxConnectionsPerIp: YupUtils.isPositiveInteger,
    poolLarkWebhook: yup.string(),
    poolXnSize: yup.number(),
    poolSupportedVersions: yup.array().of(yup.number().defined().integer().min(1).max(5)),
    jsonLogs: yup.boolean(),
    feeEstimatorMaxBlockHistory: YupUtils.isPositiveInteger,
    feeEstimatorPercentileSlow: YupUtils.isPositiveInteger,
    feeEstimatorPercentileAverage: YupUtils.isPositiveInteger,
    feeEstimatorPercentileFast: YupUtils.isPositiveInteger,
    maxSyncedAgeBlocks: yup.number().integer().min(0),
    mempoolMaxSizeBytes: yup
      .number()
      .integer()
      .min(20 * MEGABYTES),
    memPoolRecentlyEvictedCacheSize: yup.number().integer(),
    incomingWebSocketWhitelist: yup.array(yup.string().trim().defined()),
    walletGossipTransactionsMaxQueueSize: yup.number(),
    walletSyncingMaxQueueSize: yup.number(),
    walletSyncingMaxConcurrency: yup.number().integer(),
    fishHashFullContext: yup.boolean(),
  })
  .defined()

export class Config<
  TExtend extends Record<string, unknown> = Record<string, unknown>,
> extends KeyStore<ConfigOptions & TExtend> {
  readonly chainDatabasePath: string
  readonly walletDatabasePath: string
  readonly networkDefinitionPath: string
  readonly tempDir: string

  constructor(
    files: FileSystem,
    dataDir: string,
    extend: TExtend,
    configName?: string,
    extendSchema?: yup.ObjectSchema<Partial<TExtend>>,
  ) {
    const schema = (
      extendSchema ? YupUtils.union(ConfigOptionsSchema, extendSchema) : ConfigOptionsSchema
    ) as yup.ObjectSchema<Partial<ConfigOptions & TExtend>>

    super(
      files,
      configName || DEFAULT_CONFIG_NAME,
      { ...Config.GetDefaults(files, dataDir), ...extend },
      dataDir,
      schema,
    )

    this.chainDatabasePath = this.files.join(this.storage.dataDir, 'databases', 'chain')
    this.walletDatabasePath = this.files.join(this.storage.dataDir, 'databases', 'wallet')
    this.networkDefinitionPath = this.files.join(this.storage.dataDir, 'network.json')
    this.tempDir = this.files.join(this.storage.dataDir, 'temp')
  }

  static GetDefaults(files: FileSystem, dataDir: string): ConfigOptions {
    return {
      bootstrapNodes: [],
      p2pStunServers: ['stun:stun.l.google.com:19302', 'stun:global.stun.twilio.com:3478'],
      databaseMigrate: false,
      enableWallet: true,
      transactionExpirationDelta: 15,
      editor: '',
      enableListenP2P: true,
      enableLogFile: false,
      enableRpc: true,
      enableRpcIpc: DEFAULT_USE_RPC_IPC,
      enableRpcTcp: DEFAULT_USE_RPC_TCP,
      enableRpcTls: DEFAULT_USE_RPC_TLS,
      enableRpcHttp: DEFAULT_USE_RPC_HTTP,
      enableSyncing: true,
      enableTelemetry: false,
      enableMetrics: true,
      enableAssetVerification: true,
      getFundsApi: 'https://testnet.api.ironfish.network/faucet_transactions',
      ipcPath: files.resolve(files.join(dataDir, 'ironfish.ipc')),
      logLevel: '*:info',
      logPeerMessages: false,
      logPrefix: '',
      miningForce: false,
      blockGraffiti: '',
      nodeName: '',
      nodeWorkers: -1,
      nodeWorkersMax: -1,
      peerPort: DEFAULT_WEBSOCKET_PORT,
      rpcTcpHost: 'localhost',
      rpcTcpPort: 8020,
      tlsKeyPath: files.resolve(files.join(dataDir, 'certs', 'node-key.pem')),
      tlsCertPath: files.resolve(files.join(dataDir, 'certs', 'node-cert.pem')),
      rpcHttpHost: 'localhost',
      rpcHttpPort: 8021,
      maxPeers: DEFAULT_MAX_PEERS,
      confirmations: 2,
      minPeers: 1,
      targetPeers: DEFAULT_TARGET_PEERS,
      keepOpenPeerSlot: DEFAULT_KEEP_OPEN_PEER_SLOT,
      telemetryApi: '',
      assetVerificationApi: '',
      generateNewIdentity: false,
      blocksPerMessage: 25,
      minerBatchSize: 50,
      preemptiveBlockMining: true,
      poolName: 'Iron Fish Pool',
      poolAccountName: undefined,
      poolBanning: true,
      poolHost: DEFAULT_POOL_HOST,
      poolPort: DEFAULT_POOL_PORT,
      poolDifficulty: '15000000000',
      poolStatusNotificationInterval: 30 * 60, // 30 minutes
      poolRecentShareCutoff: 2 * 60 * 60, // 2 hours
      poolPayoutPeriodDuration: 2 * 60 * 60, // 2 hours
      poolDiscordWebhook: '',
      poolMaxConnectionsPerIp: 0,
      poolLarkWebhook: '',
      poolXnSize: 2,
      poolSupportedVersions: [1, 2, 3],
      jsonLogs: false,
      feeEstimatorMaxBlockHistory: DEFAULT_FEE_ESTIMATOR_MAX_BLOCK_HISTORY,
      feeEstimatorPercentileSlow: DEFAULT_FEE_ESTIMATOR_PERCENTILE_SLOW,
      feeEstimatorPercentileAverage: DEFAULT_FEE_ESTIMATOR_PERCENTILE_AVERAGE,
      feeEstimatorPercentileFast: DEFAULT_FEE_ESTIMATOR_PERCENTILE_FAST,
      maxSyncedAgeBlocks: 60,
      memPoolMaxSizeBytes: 60 * MEGABYTES,
      memPoolRecentlyEvictedCacheSize: 60000,
      incomingWebSocketWhitelist: [],
      walletGossipTransactionsMaxQueueSize: 1000,
      walletSyncingMaxQueueSize: 100,
      walletSyncingMaxConcurrency: -1,
      fishHashFullContext: false,
    }
  }
}
