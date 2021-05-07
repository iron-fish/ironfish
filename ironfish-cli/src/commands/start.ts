/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { IronfishCommand, SIGNALS } from '../command'
import { DatabaseIsLockedError, IronfishNode, PromiseUtils } from 'ironfish'
import cli from 'cli-ux'
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
import { ONE_FISH_IMAGE, TELEMETRY_BANNER } from '../images'
import { Platform } from 'ironfish'

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
    workers: flags.integer({
      description:
        'number of CPU workers to use for long-running operations. 0 disables (likely to cause performance issues), -1 auto-detects based on CPU cores',
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
    forceMining: flags.boolean({
      default: undefined,
      description: 'force mining even if we are not synced',
      hidden: true,
    }),
  }

  node: IronfishNode | null = null

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
      this.sdk.config.setOverride('bootstrapNodes', flags.bootstrap.filter(Boolean))
    }
    if (flags.port != undefined && flags.port !== this.sdk.config.get('peerPort')) {
      this.sdk.config.setOverride('peerPort', flags.port)
    }
    if (flags.workers != undefined && flags.workers !== this.sdk.config.get('nodeWorkers')) {
      this.sdk.config.setOverride('nodeWorkers', flags.workers)
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
    if (
      flags.forceMining != undefined &&
      flags.forceMining !== this.sdk.config.get('miningForce')
    ) {
      this.sdk.config.setOverride('miningForce', flags.forceMining)
    }

    const node = await this.sdk.node()

    const version = Platform.getAgent('cli')
    const name = this.sdk.config.get('nodeName').trim() || null
    const port = this.sdk.config.get('peerPort')
    const bootstraps = this.sdk.config.getArray('bootstrapNodes')

    this.logger.log(`\n${ONE_FISH_IMAGE}`)
    this.logger.log(`Peer Identity ${node.peerNetwork.localPeer.publicIdentity}`)
    this.logger.log(`Peer Agent    ${version}`)
    this.logger.log(`Port          ${port}`)
    this.logger.log(`Bootstrap     ${bootstraps.join(',') || 'NONE'}`)
    this.logger.log(`Node Name     ${name || 'NONE'}`)
    this.logger.log(` `)

    await this.waitForOpenDatabase(node)

    if (this.closing) {
      return startDoneResolve()
    }

    if (!(await node.chain.hasGenesisBlock())) {
      await this.addGenesisBlock(node)
    }

    if (node.internal.get('isFirstRun')) {
      await this.firstRun(node)
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
   * Wait for when we can open connections to the databases because another node can be using it
   */
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

  /**
   * Insert the genesis block into the node
   */
  async addGenesisBlock(node: IronfishNode): Promise<void> {
    cli.action.start('Initializing the blockchain', 'Loading the genesis block', {
      stdout: true,
    })

    const result = await node.seed()
    if (!result) {
      cli.action.stop('Failed to seed the database with the genesis block.')
    }

    cli.action.stop('Genesis block loaded successfully')
  }

  /**
   * Information displayed the first time a node is running
   */
  async firstRun(node: IronfishNode): Promise<void> {
    // Try to get the user to display telementry
    if (!node.config.get('enableTelemetry')) {
      this.logger.log(TELEMETRY_BANNER)
    }

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
}
