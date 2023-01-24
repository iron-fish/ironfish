/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { verifyTransform } from '@ironfish/rust-nodejs'
import { ErrorUtils, Logger, SetTimeoutToken } from '@ironfish/sdk'
import fsAsync from 'fs/promises'
import net from 'net'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { S3Utils } from '../utils'
import { getDownloadUrl } from '../utils/s3'
import { CeremonyClientMessage, CeremonyServerMessage } from './schema'

const CONTRIBUTE_TIMEOUT_MS = 5 * 60 * 1000
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000
const PRESIGNED_EXPIRATION_SEC = 5 * 60

type CurrentContributor = {
  state: 'STARTED' | 'UPLOADING'
  client: CeremonyServerClient
  actionTimeout: SetTimeoutToken
}

class CeremonyServerClient {
  id: string
  socket: net.Socket
  connected: boolean
  logger: Logger

  constructor(options: { socket: net.Socket; id: string; logger: Logger }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
    this.logger = options.logger.withTag(`client:${this.id.slice(0, 4)}..${this.id.slice(-4)}`)
  }

  send(message: CeremonyServerMessage): void {
    this.socket.write(JSON.stringify(message) + '\n')
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
  private s3Client: S3Client

  readonly tempDir: string

  private queue: CeremonyServerClient[]

  private currentContributor: CurrentContributor | null = null

  constructor(options: {
    logger: Logger
    port: number
    host: string
    s3Bucket: string
    s3Client: S3Client
    tempDir: string
  }) {
    this.logger = options.logger
    this.queue = []

    this.host = options.host
    this.port = options.port

    this.tempDir = options.tempDir

    this.s3Bucket = options.s3Bucket
    this.s3Client = options.s3Client

    this.server = net.createServer((s) => this.onConnection(s))
  }

  async getLatestParamName(): Promise<string> {
    const paramFileNames = await S3Utils.getBucketObjects(this.s3Client, this.s3Bucket)
    const validParams = paramFileNames
      .slice(0)
      .filter((fileName) => /^params_\d{4}$/.exec(fileName)?.length === 1)
    validParams.sort()
    return validParams[validParams.length - 1]
  }

  closeClient(client: CeremonyServerClient, error?: Error): void {
    if (this.currentContributor?.client.id === client.id) {
      clearTimeout(this.currentContributor.actionTimeout)
      this.currentContributor = null
      void this.startNextContributor()
    }

    client.close(error)
  }

  /** initiate a contributor if one does not already exist */
  async startNextContributor(): Promise<void> {
    if (this.currentContributor !== null) {
      return
    }

    const nextClient = this.queue.shift()
    if (!nextClient) {
      return
    }

    const contributionTimeout = setTimeout(() => {
      this.closeClient(nextClient, new Error('Failed to complete contribution in time'))
    }, CONTRIBUTE_TIMEOUT_MS)

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
      // S3Client doesn't support unauthenticated downloads, so we can build the URL to download for the client:
      downloadLink: S3Utils.getDownloadUrl(this.s3Bucket, latestParamName, { accelerated: true }, { dualStack: true }),
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
    this.queue.push(client)
    client.send({ method: 'joined', queueLocation: this.queue.length })

    socket.on('data', (data: Buffer) => void this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    client.logger.info(`Connected ${this.queue.length} total`)
    void this.startNextContributor()
  }

  private onDisconnect(client: CeremonyServerClient): void {
    this.closeClient(client)
    this.queue = this.queue.filter((c) => client.id !== c.id)
    client.logger.info(`Disconnected (${this.queue.length} total)`)
  }

  private onError(client: CeremonyServerClient, e: Error): void {
    this.closeClient(client, e)
    this.queue = this.queue.filter((c) => client.id === c.id)
    client.logger.info(
      `Disconnected with error '${ErrorUtils.renderError(e)}'. (${this.queue.length} total)`,
    )
  }

  private async onData(client: CeremonyServerClient, data: Buffer): Promise<void> {
    const message = data.toString('utf-8')

    let parsedMessage
    try {
      parsedMessage = JSON.parse(message) as CeremonyClientMessage
    } catch {
      client.logger.error(`Received unknown message: ${message}`)
      return
    }

    client.logger.info(`Message Received: ${parsedMessage.method}`)

    if (parsedMessage.method === 'contribution-complete') {
      return this.handleContributionComplete(client).catch((e) => {
        if (e instanceof Error) {
          client.logger.error(
            `error handling contribution complete ${ErrorUtils.renderError(e)}`,
          )
          this.closeClient(client, new Error(`error generating upload url`))
          return
        }

        client.logger.error(`unknown error handling contribution complete`)
        return
      })
    } else if (parsedMessage.method === 'upload-complete') {
      return this.handleUploadComplete(client).catch((e) => {
        if (e instanceof Error) {
          client.logger.error(`error handling upload complete ${ErrorUtils.renderError(e)}`)
          this.closeClient(client, new Error(`error verifying uploaded params`))
          return
        }

        client.logger.error(`unknown error handling upload complete`)
        return
      })
    } else {
      client.logger.error(`Unknown Message Received: ${message}`)
    }
  }

  private async handleContributionComplete(client: CeremonyServerClient) {
    if (this.currentContributor?.client.id !== client.id) {
      throw new Error('upload-complete message sent but not the current contributor')
    }

    this.currentContributor.actionTimeout && clearTimeout(this.currentContributor.actionTimeout)

    client.logger.info('generating presigned URL')

    const presignedUrl = await S3Utils.getPresignedUploadUrl(
      this.s3Client,
      this.s3Bucket,
      client.id,
      PRESIGNED_EXPIRATION_SEC,
    )

    client.logger.info('sending back presigned URL')

    this.currentContributor.actionTimeout = setTimeout(() => {
      this.closeClient(client, new Error('Failed to complete upload in time'))
    }, UPLOAD_TIMEOUT_MS)

    client.send({
      method: 'initiate-upload',
      uploadLink: presignedUrl,
    })
  }

  private sendUpdatedLocationsToClients() {
    for (const [i, client] of this.queue.entries()) {
      client.send({ method: 'joined', queueLocation: i })
    }
  }

  private async handleUploadComplete(client: CeremonyServerClient) {
    if (this.currentContributor?.client.id !== client.id) {
      throw new Error('upload-complete message sent but not the current contributor')
    }

    this.currentContributor.actionTimeout && clearTimeout(this.currentContributor.actionTimeout)

    client.logger.info('getting latest contribution from S3')
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
    await S3Utils.deleteBucketObject(this.s3Client, this.s3Bucket, client.id)

    client.logger.info(`Verifying contribution`)
    const hash = await verifyTransform(oldParamsDownloadPath, newParamsDownloadPath)

    client.logger.info(`Uploading verified contribution`)
    const destFile = 'params_' + nextParamNumber.toString().padStart(4, '0')
    await S3Utils.uploadToBucket(
      this.s3Client,
      newParamsDownloadPath,
      'application/octet-stream',
      this.s3Bucket,
      destFile,
      client.logger,
    )

    client.logger.info(`Cleaning up local files`)
    await fsAsync.rename(newParamsDownloadPath, path.join(this.tempDir, destFile))
    await fsAsync.rm(oldParamsDownloadPath)

    const downloadLink = S3Utils.getDownloadUrl(
      this.s3Bucket,
      destFile,
      {
        accelerated: true,
      },
      { dualStack: true },
    )

    client.send({ method: 'contribution-verified', hash, downloadLink, contributionNumber: nextParamNumber })

    client.logger.info(`Contribution ${nextParamNumber} complete`)
    await this.startNextContributor()
    this.sendUpdatedLocationsToClients()
  }
}
