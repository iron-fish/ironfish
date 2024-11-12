/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Assert,
  EncryptedWalletMigrationError,
  FullNode,
  NodeUtils,
  PromiseUtils,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import inspector from 'node:inspector'
import { v4 as uuid } from 'uuid'
import { IronfishCommand, SIGNALS } from '../command'
import {
  RpcAuthFlag,
  RpcAuthFlagKey,
  RpcHttpHostFlag,
  RpcHttpHostFlagKey,
  RpcHttpPortFlag,
  RpcHttpPortFlagKey,
  RpcTcpHostFlag,
  RpcTcpHostFlagKey,
  RpcTcpPortFlag,
  RpcTcpPortFlagKey,
  RpcTcpTlsFlag,
  RpcTcpTlsFlagKey,
  RpcUseHttpFlag,
  RpcUseHttpFlagKey,
  RpcUseIpcFlag,
  RpcUseIpcFlagKey,
  RpcUseTcpFlag,
  RpcUseTcpFlagKey,
} from '../flags'
import { ONE_FISH_IMAGE } from '../images'

export const ENABLE_TELEMETRY_CONFIG_KEY = 'enableTelemetry'
const DEFAULT_ACCOUNT_NAME = 'default'

export default class Start extends IronfishCommand {
  static description = 'start the node'

  static flags = {
    [RpcUseIpcFlagKey]: { ...RpcUseIpcFlag, allowNo: true } as typeof RpcUseIpcFlag,
    [RpcUseTcpFlagKey]: { ...RpcUseTcpFlag, allowNo: true } as typeof RpcUseTcpFlag,
    [RpcUseHttpFlagKey]: { ...RpcUseHttpFlag, allowNo: true } as typeof RpcUseHttpFlag,
    [RpcTcpTlsFlagKey]: RpcTcpTlsFlag,
    [RpcAuthFlagKey]: RpcAuthFlag,
    [RpcTcpHostFlagKey]: RpcTcpHostFlag,
    [RpcTcpPortFlagKey]: RpcTcpPortFlag,
    [RpcHttpHostFlagKey]: RpcHttpHostFlag,
    [RpcHttpPortFlagKey]: RpcHttpPortFlag,
    bootstrap: Flags.string({
      char: 'b',
      description: 'Comma-separated addresses of bootstrap nodes to connect to',
      multiple: true,
    }),
    port: Flags.integer({
      char: 'p',
      description: 'Port to run the local ws server on',
    }),
    workers: Flags.integer({
      description:
        'Number of CPU workers to use for long-running operations. 0 disables (likely to cause performance issues), -1 auto-detects based on CPU cores',
    }),
    graffiti: Flags.string({
      char: 'g',
      default: undefined,
      description: 'Set the graffiti for the node',
    }),
    name: Flags.string({
      char: 'n',
      description: 'Name for the node',
      hidden: true,
    }),
    listen: Flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'Disable the web socket listen server',
      hidden: true,
    }),
    forceMining: Flags.boolean({
      default: undefined,
      description: 'Force mining even if we are not synced',
      hidden: true,
    }),
    logPeerMessages: Flags.boolean({
      default: undefined,
      description: 'Track all messages sent and received by peers',
      hidden: true,
    }),
    generateNewIdentity: Flags.boolean({
      default: false,
      description: 'Generate new identity for each new start',
      hidden: true,
    }),
    upgrade: Flags.boolean({
      allowNo: true,
      description: 'Run migrations when an upgrade is required',
    }),
    networkId: Flags.integer({
      char: 'i',
      default: undefined,
      description: 'Network ID of an official Iron Fish network to connect to',
    }),
    customNetwork: Flags.string({
      char: 'c',
      default: undefined,
      description:
        'Path to a JSON file containing the network definition of a custom network to connect to',
    }),
    wallet: Flags.boolean({
      allowNo: true,
      default: undefined,
      description: `Enable the node's wallet to scan transactions and decrypt notes from the blockchain`,
    }),
  }

  node: FullNode | null = null

  /**
   * This promise is used to wait until start is finished beforer closeFromSignal continues
   * because you can cause errors if you attempt to shutdown while the node is still starting
   * up to reduce shutdown hanging, start should cancel if it detects this.isClosing is true
   * and resolve this promise
   */
  startDonePromise: Promise<void> | null = null

  async start(): Promise<void> {
    const [startDonePromise, startDoneResolve] = PromiseUtils.split<void>()
    this.startDonePromise = startDonePromise

    const { flags } = await this.parse(Start)
    const {
      bootstrap,
      forceMining,
      graffiti,
      listen,
      logPeerMessages,
      name,
      port,
      workers,
      generateNewIdentity,
      upgrade,
      networkId,
      customNetwork,
      wallet,
    } = flags

    if (bootstrap !== undefined) {
      // Parse comma-separated bootstrap nodes
      const bootstrapNodes = bootstrap
        .flatMap((b) => b.split(','))
        .filter(Boolean)
        .map((b) => b.trim())

      this.sdk.config.setOverride('bootstrapNodes', bootstrapNodes)
    }
    if (port !== undefined && port !== this.sdk.config.get('peerPort')) {
      this.sdk.config.setOverride('peerPort', port)
    }
    if (workers !== undefined && workers !== this.sdk.config.get('nodeWorkers')) {
      this.sdk.config.setOverride('nodeWorkers', workers)
    }
    if (graffiti !== undefined && graffiti !== this.sdk.config.get('blockGraffiti')) {
      this.sdk.config.setOverride('blockGraffiti', graffiti)
    }
    if (name !== undefined && name.trim() !== this.sdk.config.get('nodeName')) {
      this.sdk.config.setOverride('nodeName', name.trim())
    }
    if (listen !== undefined && listen !== this.sdk.config.get('enableListenP2P')) {
      this.sdk.config.setOverride('enableListenP2P', listen)
    }
    if (forceMining !== undefined && forceMining !== this.sdk.config.get('miningForce')) {
      this.sdk.config.setOverride('miningForce', forceMining)
    }
    if (wallet !== undefined && wallet !== this.sdk.config.get('enableWallet')) {
      this.sdk.config.setOverride('enableWallet', wallet)
    }
    if (
      logPeerMessages !== undefined &&
      logPeerMessages !== this.sdk.config.get('logPeerMessages')
    ) {
      this.sdk.config.setOverride('logPeerMessages', logPeerMessages)
    }
    if (
      generateNewIdentity !== undefined &&
      generateNewIdentity !== this.sdk.config.get('generateNewIdentity')
    ) {
      this.sdk.config.setOverride('generateNewIdentity', generateNewIdentity)
    }
    if (upgrade !== undefined && upgrade !== this.sdk.config.get('databaseMigrate')) {
      this.sdk.config.setOverride('databaseMigrate', upgrade)
    }

    if (networkId !== undefined && customNetwork !== undefined) {
      throw new Error(
        'Cannot specify both the networkId and customNetwork flags at the same time',
      )
    }

    if (!this.sdk.internal.get('telemetryNodeId')) {
      this.sdk.internal.set('telemetryNodeId', uuid())
      await this.sdk.internal.save()
    }

    const node = await this.sdk.node({
      customNetworkPath: customNetwork,
      networkId,
    })

    const nodeName = this.sdk.config.get('nodeName').trim() || null
    const blockGraffiti = this.sdk.config.get('blockGraffiti').trim() || null
    const peerPort = this.sdk.config.get('peerPort')
    const bootstraps = this.sdk.config.getArray('bootstrapNodes')
    const walletEnabled = this.sdk.config.get('enableWallet')

    this.log(`\n${ONE_FISH_IMAGE}`)
    this.log(`Version       ${node.pkg.version} @ ${node.pkg.git}`)
    this.log(`Node Name     ${nodeName || 'NONE'}`)
    this.log(`Graffiti      ${blockGraffiti || 'NONE'}`)
    this.log(`Peer Identity ${node.peerNetwork.localPeer.publicIdentity}`)
    this.log(`Peer Agent    ${node.peerNetwork.localPeer.agent}`)
    this.log(`Peer Port     ${peerPort}`)
    this.log(`Wallet        ${walletEnabled ? 'ENABLED' : 'DISABLED'}`)
    this.log(`Bootstrap     ${bootstraps.join(',') || 'NONE'}`)
    if (inspector.url()) {
      this.log(`Inspector     ${String(inspector.url())}`)
    }
    this.log(` `)

    try {
      await NodeUtils.waitForOpen(node, () => this.closing)
    } catch (e) {
      if (e instanceof EncryptedWalletMigrationError) {
        this.logger.error(e.message)
        this.logger.error(
          'Run `ironfish migrations:start` to enter wallet passphrase and migrate wallet databases',
        )
        this.exit(1)
      } else {
        throw e
      }
    }

    if (this.closing) {
      return startDoneResolve()
    }

    const headBlock = await node.chain.getBlock(node.chain.head)
    Assert.isNotNull(headBlock)
    const trees = await node.chain.verifier.verifyConnectedBlock(headBlock)
    if (!trees.valid) {
      this.log(
        `Error starting node: your merkle trees are corrupt: ${String(trees.reason)}.` +
          `\n  1. Run ironfish chain:repair to attempt repair` +
          `\n  2. Delete your database at ${node.config.chainDatabasePath}`,
      )

      this.exit(1)
    }

    if (node.internal.get('isFirstRun')) {
      await this.firstRun(node)
    }

    const encrypted = await node.wallet.accountsEncrypted()
    if (encrypted) {
      this.log('Your wallet is encrypted. Run ironfish wallet:unlock to access your accounts')
      this.log()
    }

    await node.start()
    this.node = node

    startDoneResolve()
    this.listenForSignals()
    await node.waitForShutdown()
  }

  async closeFromSignal(signal: SIGNALS): Promise<void> {
    this.log(`Shutting down node after ${signal}`)
    await this.startDonePromise
    await this.node?.shutdown()
    await this.node?.closeDB()
  }

  /**
   * Information displayed the first time a node is running
   */
  async firstRun(node: FullNode): Promise<void> {
    this.log('')
    this.log('Thank you for installing the Iron Fish Node.')

    if (!node.config.get(ENABLE_TELEMETRY_CONFIG_KEY)) {
      this.log('')
      this.log('To help improve Iron Fish, opt in to collecting telemetry by running')
      this.log(` > ironfish config:set ${ENABLE_TELEMETRY_CONFIG_KEY} true`)
    }

    if (!node.wallet.getDefaultAccount()) {
      await this.setDefaultAccount(node)
    }

    this.log('')
    node.internal.set('isFirstRun', false)
    node.internal.set('telemetryNodeId', uuid())
    await node.internal.save()
  }

  /**
   * Information displayed if there is no default account for the node
   */
  async setDefaultAccount(node: FullNode): Promise<void> {
    if (!node.wallet.accountExists(DEFAULT_ACCOUNT_NAME)) {
      const account = await node.wallet.createAccount(DEFAULT_ACCOUNT_NAME, {
        setDefault: true,
      })

      this.log(`New default account created: ${account.name}`)
      this.log(`Account's public address: ${account.publicAddress}`)
    } else {
      this.log(`The default account is now: ${DEFAULT_ACCOUNT_NAME}`)
      await node.wallet.setDefaultAccount(DEFAULT_ACCOUNT_NAME)
    }

    this.log('')
    await node.internal.save()
  }
}
