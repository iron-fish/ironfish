/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IronfishCommand, SIGNALS } from '../command'
import {
  DatabaseIsLockedError,
  DEFAULT_WEBSOCKET_PORT,
  IronfishNode,
  parseUrl,
  Peer,
  PeerNetwork,
  privateIdentityToIdentity,
  PromiseUtils,
  setDefaultTags,
} from 'ironfish'
import cli from 'cli-ux'
import tweetnacl from 'tweetnacl'
import wrtc from 'wrtc'
import WSWebSocket from 'ws'
import {
  ConfigFlag,
  ConfigFlagKey,
  DatabaseFlag,
  DatabaseFlagKey,
  DataDirFlag,
  DataDirFlagKey,
  RpcTcpHostFlag,
  RpcTcpHostFlagKey,
  RpcTcpPortFlag,
  RpcTcpPortFlagKey,
  RpcUseIpcFlag,
  RpcUseIpcFlagKey,
  RpcUseTcpFlag,
  RpcUseTcpFlagKey,
  VerboseFlag,
  VerboseFlagKey,
} from '../flags'
import { ONE_FISH_IMAGE } from '../images'

const DEFAULT_ACCOUNT_NAME = 'default'

export default class Start extends IronfishCommand {
  static description = 'Start the node'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    [DatabaseFlagKey]: DatabaseFlag,
    [RpcUseIpcFlagKey]: { ...RpcUseIpcFlag, allowNo: true },
    [RpcUseTcpFlagKey]: { ...RpcUseTcpFlag, allowNo: true },
    [RpcTcpHostFlagKey]: RpcTcpHostFlag,
    [RpcTcpPortFlagKey]: RpcTcpPortFlag,
    bootstrap: flags.string({
      char: 'b',
      description: 'comma-separated addresses of bootstrap nodes to connect to',
      multiple: true,
    }),
    port: flags.integer({
      char: 'p',
      description: 'port to run the local ws server on',
    }),
    name: flags.string({
      char: 'n',
      description: 'name for the node',
      hidden: true,
    }),
    worker: flags.boolean({
      char: 'w',
      description: 'is this a worker node',
      hidden: true,
    }),
    listen: flags.boolean({
      allowNo: true,
      default: undefined,
      description: 'disable the web socket listen server',
      hidden: true,
    }),
  }

  node: IronfishNode | null = null

  peerNetwork: PeerNetwork | null = null

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

    const { flags } = this.parse(Start)

    if (flags.bootstrap != undefined) {
      this.sdk.config.setOverride('bootstrapNodes', flags.bootstrap)
    }
    if (flags.port != undefined && flags.port !== this.sdk.config.get('peerPort')) {
      this.sdk.config.setOverride('peerPort', flags.port)
    }
    if (flags.name != undefined && flags.name.trim() !== this.sdk.config.get('nodeName')) {
      this.sdk.config.setOverride('nodeName', flags.name.trim())
    }
    if (flags.listen != undefined && flags.listen !== this.sdk.config.get('enableListenP2P')) {
      this.sdk.config.setOverride('enableListenP2P', flags.listen)
    }
    if (flags.worker != undefined && flags.worker !== this.sdk.config.get('isWorker')) {
      this.sdk.config.setOverride('isWorker', flags.worker)
    }

    const peerPort = this.sdk.config.get('peerPort')
    // Allow comma-separated nodes and remove empty strings
    const bootstrapNodes = (this.sdk.config.get('bootstrapNodes') || [])
      .flatMap((i) => i.split(','))
      .filter(Boolean)

    // Start peer networking
    const identity = tweetnacl.box.keyPair()
    const version = this.sdk.getVersion('cli')
    const anonymousTelemetryId = Math.random().toString().substring(2)
    setDefaultTags({ version, sessionId: anonymousTelemetryId })

    const nodeName = this.sdk.config.get('nodeName').trim() || null

    this.logger.log(`\n${ONE_FISH_IMAGE}`)
    this.logger.log(`Peer Identity                 ${privateIdentityToIdentity(identity)}`)
    this.logger.log(`Peer Version                  ${version}`)
    this.logger.log(`Port                          ${peerPort}`)
    this.logger.log(`Bootstrap                     ${bootstrapNodes.join(',') || 'NONE'}`)

    if (nodeName) {
      this.logger.log(`Node Name                     ${nodeName}`)
    }
    this.logger.log(` `)

    const peerNetwork = new PeerNetwork(
      identity,
      version,
      WSWebSocket,
      wrtc,
      {
        port: peerPort,
        name: nodeName,
        maxPeers: this.sdk.config.get('maxPeers'),
        enableListen: this.sdk.config.get('enableListenP2P'),
        targetPeers: this.sdk.config.get('targetPeers'),
        isWorker: this.sdk.config.get('isWorker'),
        broadcastWorkers: this.sdk.config.get('broadcastWorkers'),
        simulateLatency: this.sdk.config.get('p2pSimulateLatency'),
      },
      this.logger,
      this.sdk.metrics,
    )

    peerNetwork.peerManager.onConnect.on((peer: Peer) => {
      this.logger.debug(`Connected to ${peer.getIdentityOrThrow()}`)
    })

    peerNetwork.peerManager.onDisconnect.on((peer: Peer) => {
      this.logger.debug(`Disconnected from ${String(peer.state.identity)}`)
    })

    peerNetwork.onIsReadyChanged.on((isReady: boolean) => {
      if (isReady) this.logger.info(`Connected to the Iron Fish network`)
      else this.logger.info(`Not connected to the Iron Fish network`)
    })

    const node = await this.sdk.node()
    await this.waitForOpenDatabase(node)
    if (this.closing) return startDoneResolve()

    // Information displayed the first time a node is running
    if (node.internal.get('isFirstRun')) {
      if (!node.config.get('enableTelemetry'))
        this.logger.log(`
#################################################################
#    Thank you for installing the Iron Fish Node.               #
#    To help improve Ironfish, opt in to collecting telemetry   #
#    by setting telemetry=true in your configuration file       #
#################################################################
`)

      // Create a default account on startup
      if (!node.accounts.getDefaultAccount()) {
        if (node.accounts.accountExists(DEFAULT_ACCOUNT_NAME)) {
          await node.accounts.setDefaultAccount(DEFAULT_ACCOUNT_NAME)
          this.log(`The default account is now: ${DEFAULT_ACCOUNT_NAME}\n`)
        } else {
          await this.sdk.clientMemory.connect(node)
          const result = await this.sdk.clientMemory.createAccount({
            name: DEFAULT_ACCOUNT_NAME,
          })
          this.log(
            `New default account created: ${DEFAULT_ACCOUNT_NAME} \nAccount's public address: ${result?.content.publicAddress}\n`,
          )
        }
      }

      node.internal.set('isFirstRun', false)
      await node.internal.save()
    }

    if (!(await node.captain.chain.hasGenesisBlock())) {
      cli.action.start('Initializing the blockchain', 'Creating the genesis block', {
        stdout: true,
      })
      const result = await node.seed()
      if (!result) {
        cli.action.stop('Failed to seed the database with the genesis block.')
      }
      cli.action.stop('Genesis block created successfully')
    }

    node.networkBridge.attachPeerNetwork(peerNetwork)

    await node.start()

    peerNetwork.start()
    for (const node of bootstrapNodes) {
      const url = parseUrl(node)
      if (!url.hostname)
        throw new Error(
          `Could not determine a hostname for bootstrap node "${node}". Is it formatted correctly?`,
        )

      // If the user has not specified a port, we can guess that
      // it's running on the default ironfish websocket port
      const port = url.port ? url.port : DEFAULT_WEBSOCKET_PORT
      const address = url.hostname + `:${port}`
      peerNetwork.peerManager.connectToWebSocketAddress(address, true)
    }

    this.node = node
    this.peerNetwork = peerNetwork

    startDoneResolve()
    this.listenForSignals()
    await node.waitForShutdown()
  }

  async closeFromSignal(signal: SIGNALS): Promise<void> {
    this.log(`Shutting down node after ${signal}`)
    await this.startDonePromise
    this.peerNetwork?.stop()
    await this.node?.shutdown()
    await this.node?.closeDB()
  }

  async waitForOpenDatabase(node: IronfishNode): Promise<void> {
    let warnDatabaseInUse = false
    const OPEN_DB_RETRY_TIME = 500

    while (!this.closing) {
      try {
        await node.openDB()
        return
      } catch (e) {
        if (e instanceof DatabaseIsLockedError) {
          if (!warnDatabaseInUse) {
            this.log('Another node is using the database, waiting for that node to close.')
            warnDatabaseInUse = true
          }

          await new Promise((r) => setTimeout(r, OPEN_DB_RETRY_TIME))
          continue
        }

        throw e
      }
    }
  }
}
