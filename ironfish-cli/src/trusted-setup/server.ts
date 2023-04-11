/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { verifyTransform } from '@ironfish/rust-nodejs'
import { ErrorUtils, Logger, MessageBuffer, SetTimeoutToken, YupUtils } from '@ironfish/sdk'
import fsAsync from 'fs/promises'
import net from 'net'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { S3Utils } from '../utils'
import { CeremonyClientMessageSchema, CeremonyServerMessage } from './schema'

type CurrentContributor =
  | {
      state: 'STARTED'
      client: CeremonyServerClient
      actionTimeout: SetTimeoutToken
    }
  | {
      state: 'UPLOADING'
      client: CeremonyServerClient
      actionTimeout: SetTimeoutToken
    }
  | {
      state: 'VERIFYING'
      client: CeremonyServerClient | null
    }

class CeremonyServerClient {
  id: string
  socket: net.Socket
  connected: boolean
  logger: Logger
  readonly messageBuffer: MessageBuffer

  private _joined?: {
    name?: string
  }

  constructor(options: { socket: net.Socket; id: string; logger: Logger }) {
    this.messageBuffer = new MessageBuffer('\n')
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.logger = options.logger
      .withTag(`client:${this.id.slice(0, 4)}..${this.id.slice(-4)}`)
      .withTag(`ip:${this.socket.remoteAddress || 'unknown'}`)
  }

  send(message: CeremonyServerMessage): void {
    this.socket.write(JSON.stringify(message) + '\n')
  }

  join(name?: string) {
    this._joined = { name }
  }

  get joined(): boolean {
    return this._joined !== undefined
  }

  get name(): string | undefined {
    return this._joined?.name
  }

  close(error?: Error): void {
    if (!this.connected) {
      return
    }

    this.connected = false
    this.socket.destroy(error)
  }
}

export class CeremonyServer {
  readonly server: net.Server
  readonly logger: Logger

  private stopPromise: Promise<void> | null = null
  private stopResolve: (() => void) | null = null

  readonly port: number
  readonly host: string

  readonly s3Bucket: string
  readonly downloadPrefix: string
  private s3Client: S3Client

  readonly tempDir: string

  private queue: CeremonyServerClient[] = []
  private privateQueue: CeremonyServerClient[] = []

  private currentContributor: CurrentContributor | null = null

  readonly contributionTimeoutMs: number
  readonly uploadTimeoutMs: number
  readonly presignedExpirationSec: number

  readonly startDate: number
  private token: string

  readonly enableIPBanning: boolean

  constructor(options: {
    logger: Logger
    port: number
    host: string
    s3Bucket: string
    downloadPrefix: string
    s3Client: S3Client
    tempDir: string
    contributionTimeoutMs: number
    uploadTimeoutMs: number
    presignedExpirationSec: number
    startDate: number
    token: string
    enableIPBanning: boolean
  }) {
    this.logger = options.logger

    this.host = options.host
    this.port = options.port

    this.tempDir = options.tempDir

    this.s3Bucket = options.s3Bucket
    this.downloadPrefix = options.downloadPrefix
    this.s3Client = options.s3Client

    this.contributionTimeoutMs = options.contributionTimeoutMs
    this.uploadTimeoutMs = options.uploadTimeoutMs
    this.presignedExpirationSec = options.presignedExpirationSec

    this.startDate = options.startDate
    this.token = options.token

    this.enableIPBanning = options.enableIPBanning

    this.server = net.createServer((s) => this.onConnection(s))
  }

  async getLatestParamName(): Promise<string> {
    const paramFileNames = await S3Utils.getBucketObjects(this.s3Client, this.s3Bucket)
    const validParams = paramFileNames
      .slice(0)
      .filter((fileName) => /^params_\d{5}$/.test(fileName))
    validParams.sort()
    return validParams[validParams.length - 1]
  }

  totalQueueLength(): number {
    return this.queue.length + this.privateQueue.length
  }

  closeClient(client: CeremonyServerClient, error?: Error, disconnect = false): void {
    if (this.currentContributor?.client?.id === client.id) {
      if (this.currentContributor.state === 'VERIFYING') {
        this.currentContributor.client = null
      } else {
        clearTimeout(this.currentContributor.actionTimeout)
        this.currentContributor = null
        void this.startNextContributor()
      }
    }

    disconnect && client.send({ method: 'disconnect', error: ErrorUtils.renderError(error) })

    client.close(error)
  }

  /** initiate a contributor if one does not already exist */
  async startNextContributor(): Promise<void> {
    if (this.currentContributor !== null) {
      return
    }

    const nextClient = this.privateQueue.shift() || this.queue.shift()
    if (!nextClient) {
      return
    }

    const contributionTimeout = setTimeout(() => {
      this.closeClient(nextClient, new Error('Failed to complete contribution in time'))
    }, this.contributionTimeoutMs)

    this.currentContributor = {
      state: 'STARTED',
      client: nextClient,
      actionTimeout: contributionTimeout,
    }

    const latestParamName = await this.getLatestParamName()
    const nextParamNumber = parseInt(latestParamName.split('_')[1]) + 1

    nextClient.logger.info(`Starting contribution ${nextParamNumber}`)

    nextClient.send({
      method: 'initiate-contribution',
      downloadLink: `${this.downloadPrefix}/${latestParamName}`,
      contributionNumber: nextParamNumber,
    })
  }

  async start(): Promise<void> {
    // Pre-make the directories to check for access
    await fsAsync.mkdir(this.tempDir, { recursive: true })

    this.stopPromise = new Promise((r) => (this.stopResolve = r))
    this.server.listen(this.port, this.host)
    this.logger.info(`Server started at ${this.host}:${this.port}`)
  }

  stop(): void {
    this.server.close()
    this.stopResolve && this.stopResolve()
    this.stopPromise = null
    this.stopResolve = null
    this.logger.info(`Server stopped on ${this.host}:${this.port}`)
  }

  async waitForStop(): Promise<void> {
    await this.stopPromise
  }

  private onConnection(socket: net.Socket): void {
    const client = new CeremonyServerClient({ socket, id: uuid(), logger: this.logger })

    socket.on('data', (data: Buffer) => void this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onDisconnect(client, e))

    const ip = socket.remoteAddress
    if (
      this.enableIPBanning &&
      (ip === undefined ||
        this.queue.find((c) => c.socket.remoteAddress === ip) !== undefined ||
        this.privateQueue.find((c) => c.socket.remoteAddress === ip) !== undefined ||
        this.currentContributor?.client?.socket.remoteAddress === ip)
    ) {
      this.closeClient(client, new Error('IP address already in queue'), true)
      return
    }
  }

  private onDisconnect(client: CeremonyServerClient, e?: Error): void {
    this.closeClient(client, e)
    this.queue = this.queue.filter((c) => client.id !== c.id)
    this.privateQueue = this.privateQueue.filter((c) => client.id !== c.id)

    e && client.logger.info(`Disconnected with error: ${ErrorUtils.renderError(e)}`)
    client.logger.info(
      `(Disconnected) public: ${this.queue.length}, private: ${this.privateQueue.length}`,
    )
  }

  private async onData(client: CeremonyServerClient, data: Buffer): Promise<void> {
    client.messageBuffer.write(data)

    for (const message of client.messageBuffer.readMessages()) {
      const result = await YupUtils.tryValidate(CeremonyClientMessageSchema, message)
      if (result.error) {
        client.logger.error(`Could not parse client message: ${message}`)
        this.closeClient(client, new Error(`Could not parse message`), true)
        return
      }

      const parsedMessage = result.result

      client.logger.info(`Message Received: ${parsedMessage.method}`)

      if (parsedMessage.method === 'join' && !client.joined) {
        if (Date.now() < this.startDate && parsedMessage.token !== this.token) {
          this.closeClient(
            client,
            new Error(
              `The ceremony does not start until ${new Date(this.startDate).toUTCString()}`,
            ),
            true,
          )
          return
        }

        client.join(parsedMessage.name)

        if (parsedMessage.token === this.token) {
          this.privateQueue.push(client)
          client.send(this.getJoinedMessage(this.privateQueue.length))
        } else {
          this.queue.push(client)
          client.send(this.getJoinedMessage(this.totalQueueLength()))
        }

        client.logger.info(
          `(Connected) public: ${this.queue.length}, private: ${this.privateQueue.length}`,
        )
        void this.startNextContributor()
      } else if (parsedMessage.method === 'contribution-complete') {
        await this.handleContributionComplete(client).catch((e) => {
          client.logger.error(
            `Error handling contribution-complete: ${ErrorUtils.renderError(e)}`,
          )
          this.closeClient(client, new Error(`Error generating upload url`))
        })
      } else if (parsedMessage.method === 'upload-complete') {
        await this.handleUploadComplete(client).catch((e) => {
          client.logger.error(`Error handling upload-complete: ${ErrorUtils.renderError(e)}`)

          this.closeClient(client)

          if (this.currentContributor?.client == null) {
            this.currentContributor = null
            void this.startNextContributor()
          }
        })
      } else {
        client.logger.error(`Unknown method received: ${message}`)
        this.closeClient(client, new Error(`Unknown method received`))
      }
    }
  }

  private async handleContributionComplete(client: CeremonyServerClient) {
    if (
      this.currentContributor?.client?.id !== client.id ||
      this.currentContributor.state !== 'STARTED'
    ) {
      throw new Error('contribution-complete message sent but not the current contributor')
    }

    clearTimeout(this.currentContributor.actionTimeout)

    client.logger.info('Generating presigned URL')

    const presignedUrl = await S3Utils.getPresignedUploadUrl(
      this.s3Client,
      this.s3Bucket,
      client.id,
      this.presignedExpirationSec,
    )

    client.logger.info('Sending back presigned URL')

    client.send({
      method: 'initiate-upload',
      uploadLink: presignedUrl,
    })

    this.currentContributor = {
      state: 'UPLOADING',
      actionTimeout: setTimeout(() => {
        this.closeClient(client, new Error('Failed to complete upload in time'))
      }, this.uploadTimeoutMs),
      client: this.currentContributor.client,
    }
  }

  private getJoinedMessage(position: number): CeremonyServerMessage {
    const estimate = position * ((this.contributionTimeoutMs + this.uploadTimeoutMs) / 2)
    return { method: 'joined', queueLocation: position, estimate }
  }

  private sendUpdatedLocationsToClients() {
    for (const [i, client] of this.privateQueue.entries()) {
      client.send(this.getJoinedMessage(i + 1))
    }

    for (const [i, client] of this.queue.entries()) {
      client.send(this.getJoinedMessage(i + 1 + this.privateQueue.length))
    }
  }

  private async handleUploadComplete(client: CeremonyServerClient) {
    if (
      this.currentContributor?.client?.id !== client.id ||
      this.currentContributor.state !== 'UPLOADING'
    ) {
      throw new Error('upload-complete message sent but not the current contributor')
    }

    clearTimeout(this.currentContributor.actionTimeout)

    this.currentContributor = {
      state: 'VERIFYING',
      client: this.currentContributor.client,
    }

    client.logger.info('Getting latest contribution from S3')
    const latestParamName = await this.getLatestParamName()
    const nextParamNumber = parseInt(latestParamName.split('_')[1]) + 1

    const oldParamsDownloadPath = path.join(this.tempDir, latestParamName)

    const paramsExist = await fsAsync
      .access(oldParamsDownloadPath)
      .then((_) => true)
      .catch((_) => false)

    const oldParamsPromise = paramsExist
      ? Promise.resolve()
      : S3Utils.downloadFromBucket(
          this.s3Client,
          this.s3Bucket,
          latestParamName,
          oldParamsDownloadPath,
        )

    const newParamsDownloadPath = path.join(this.tempDir, client.id)
    const newParamsPromise = S3Utils.downloadFromBucket(
      this.s3Client,
      this.s3Bucket,
      client.id,
      newParamsDownloadPath,
    )

    client.logger.info(`Downloading params from S3 to verify`)
    await Promise.all([oldParamsPromise, newParamsPromise])

    client.logger.info(`Deleting uploaded params from S3`)
    await S3Utils.deleteFromBucket(this.s3Client, this.s3Bucket, client.id)

    client.logger.info(`Verifying contribution`)
    const hash = await verifyTransform(oldParamsDownloadPath, newParamsDownloadPath)

    client.logger.info(`Uploading verified contribution`)
    const destFile = 'params_' + nextParamNumber.toString().padStart(5, '0')

    const metadata = {
      ...(client.name && { contributorName: encodeURIComponent(client.name) }),
    }

    await S3Utils.uploadToBucket(
      this.s3Client,
      newParamsDownloadPath,
      'application/octet-stream',
      this.s3Bucket,
      destFile,
      client.logger,
      metadata,
    )

    client.logger.info(`Cleaning up local files`)
    await fsAsync.rename(newParamsDownloadPath, path.join(this.tempDir, destFile))
    await fsAsync.rm(oldParamsDownloadPath)

    client.send({
      method: 'contribution-verified',
      hash,
      downloadLink: `${this.downloadPrefix}/${destFile}`,
      contributionNumber: nextParamNumber,
    })

    client.logger.info(`Contribution ${nextParamNumber} complete`)
    this.currentContributor = null
    await this.startNextContributor()
    this.sendUpdatedLocationsToClients()
  }
}
