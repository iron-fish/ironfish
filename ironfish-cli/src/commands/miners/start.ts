/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import cli from 'cli-ux'
import {
  AsyncUtils,
  createRootLogger,
  IronfishIpcClient,
  IronfishRpcClient,
  Logger,
  Miner,
  NewBlocksStreamResponse,
  PromiseResolve,
  PromiseUtils,
  RPC_TIMEOUT_MILLIS,
} from 'ironfish'
import os from 'os'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'

export class Start extends IronfishCommand {
  static description = `Start a miner and subscribe to new blocks for the node`

  static flags = {
    ...RemoteFlags,
    workers: flags.integer({
      char: 't',
      default: 1,
      description: 'number of workers to use for mining. -1 will use ALL your available cores.',
    }),
    name: flags.string({
      char: 'n',
      description: 'An identifiable name of the miner',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(Start)

    if (flags.workers === 0 || flags.workers < -1) {
      throw new Error('--workers must be a positive integer or -1.')
    }

    if (flags.workers === -1) {
      flags.workers = os.cpus().length - 1
    }

    const client = this.sdk.client
    let connectAttempts = 0

    this.log(
      `Starting miner${flags.name ? ' ' + flags.name : ''} with ${flags.workers} worker(s)`,
    )

    cli.action.start('Starting miner')

    // eslint-disable-next-line no-constant-condition
    while (true) {
      cli.action.start('Connecting to node')
      const connected = await client.tryConnect()

      if (!connected) {
        cli.action.status =
          'Not connected to a node - waiting 5s before retrying' +
          (connectAttempts ? ` (attempts ${connectAttempts})` : '')

        connectAttempts++
        await PromiseUtils.sleep(5000)
        continue
      }

      connectAttempts = 0
      cli.action.stop('Connected')

      const miner = new MinerClient({ client })

      this.log('Authenticating')
      await miner.connect()
      await miner.waitForDisconnect()

      // const onRequestWork = async (): Promise<void> => {
      //   await client.getMinerWork({ id: info.minerId, token: info.token })
      // }

      // miner.onRequestWork.on(onRequestWork)
    }
  }
}

class MinerClient {
  miner: Miner
  logger: Logger
  client: IronfishIpcClient

  name: string | null = null
  id: number | null = null
  token: string | null = null
  connectPromise: Promise<void> | null = null
  connectResolve: PromiseResolve<void> | null = null

  constructor(options: { name?: string; client: IronfishIpcClient; logger?: Logger }) {
    this.name = options.name || null
    this.client = options.client
    this.miner = new Miner()
    this.logger = options.logger ?? createRootLogger()
  }

  async connect(): Promise<void> {
    const connection = this.client.connectMiner({ name: this.name ?? undefined })
    const info = await AsyncUtils.first(connection.contentStream())

    this.id = info.minerId
    this.token = info.token

    const [promise, resolve] = PromiseUtils.split<void>()
    this.connectPromise = promise
    this.connectResolve = resolve

    void connection
      .waitForEnd()
      .catch(() => {
        /* Eat exception */
      })
      .finally(() => {
        this.onDisconnected()
      })

    this.logger.info(`Miner connected with id ${String(this.id)}`)

    const jobs = this.client.getMinerJob({ id: this.id, token: this.token })
    for await(const job of jobs.contentStream()) {
    }
  }

  async run(): Promise<void> {
    const jobs = this.client.getMinerJob({ id: this.id, token: this.token })
    for await(const job of jobs.contentStream()) {


    await this.connectPromise
  }

  private onDisconnected() {
    this.logger.info('Miner disconnected')
    this.connectResolve?.()
  }
}
