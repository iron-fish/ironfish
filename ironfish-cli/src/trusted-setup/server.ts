/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { ErrorUtils, Logger, SetTimeoutToken } from '@ironfish/sdk'
import fsAsync from 'fs/promises'
import net from 'net'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { S3Utils } from '../utils'
import { CeremonyClientMessage, CeremonyServerMessage } from './schema'

const CONTRIBUTE_TIMEOUT_MS = 50000
const UPLOAD_TIMEOUT_MS = 50000
const PRESIGNED_EXPIRATION_SEC = 15

type CurrentContributor = {
  state: 'STARTED' | 'UPLOADING'
  client: CeremonyServerClient
  actionTimeout: SetTimeoutToken
}

class CeremonyServerClient {
  id: string
  socket: net.Socket
  connected: boolean

  constructor(options: { socket: net.Socket; id: string }) {
    this.id = options.id
    this.socket = options.socket
    this.connected = true
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

    const next = this.queue.shift()
    if (!next) {
      return
    }

    const contributionTimeout = setTimeout(() => {
      this.closeClient(next, new Error('Failed to complete contribution in time'))
    }, CONTRIBUTE_TIMEOUT_MS)

    this.currentContributor = {
      state: 'STARTED',
      client: next,
      actionTimeout: contributionTimeout,
    }

    const latestParamName = await this.getLatestParamName()
    const latestParamNumber = parseInt(latestParamName.split('_')[1])
    next.send({
      method: 'initiate-contribution',
      bucket: this.s3Bucket,
      fileName: latestParamName,
      contributionNumber: latestParamNumber,
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
    const client = new CeremonyServerClient({ socket, id: uuid() })
    this.queue.push(client)
    client.send({ method: 'joined', queueLocation: this.queue.length })

    socket.on('data', (data: Buffer) => void this.onData(client, data))
    socket.on('close', () => this.onDisconnect(client))
    socket.on('error', (e) => this.onError(client, e))

    this.logger.info(`Client ${client.id} connected. ${this.queue.length} total`)
    void this.startNextContributor()
  }

  private onDisconnect(client: CeremonyServerClient): void {
    this.closeClient(client)
    this.queue = this.queue.filter((c) => client.id !== c.id)
    this.logger.info(`Client ${client.id} disconnected (${this.queue.length} total)`)
  }

  private onError(client: CeremonyServerClient, e: Error): void {
    this.closeClient(client, e)
    this.queue = this.queue.filter((c) => client.id === c.id)
    this.logger.info(
      `Client ${client.id} disconnected with error '${ErrorUtils.renderError(e)}'. (${
        this.queue.length
      } total)`,
    )
  }

  private async onData(client: CeremonyServerClient, data: Buffer): Promise<void> {
    const message = data.toString('utf-8')

    let parsedMessage
    try {
      parsedMessage = JSON.parse(message) as CeremonyClientMessage
    } catch {
      this.logger.debug(`Received unknown message: ${message}`)
      return
    }

    this.logger.info(`Client ${client.id} sent message: ${parsedMessage.method}`)

    if (parsedMessage.method === 'contribution-complete') {
      if (this.currentContributor?.client.id !== client.id) {
        this.closeClient(
          client,
          new Error('contribution-complete message sent but not the current contributor'),
        )
        return
      }

      this.currentContributor.actionTimeout &&
        clearTimeout(this.currentContributor.actionTimeout)

      const presignedUrl = await S3Utils.getPresignedUploadUrl(
        this.s3Client,
        this.s3Bucket,
        client.id,
        PRESIGNED_EXPIRATION_SEC,
      )

      this.currentContributor.actionTimeout = setTimeout(() => {
        this.closeClient(client, new Error('Failed to complete upload in time'))
      }, UPLOAD_TIMEOUT_MS)

      client.send({
        method: 'initiate-upload',
        uploadLink: presignedUrl,
      })
    } else if (parsedMessage.method === 'upload-complete') {
      const latestParamName = await this.getLatestParamName()
      const latestParamNumber = parseInt(latestParamName.split('_')[1])

      const oldParamsDownloadPath = path.join(this.tempDir, 'params')
      await S3Utils.downloadFromBucket(
        this.s3Client,
        this.s3Bucket,
        latestParamName,
        oldParamsDownloadPath,
      )

      const newParamsDownloadPath = path.join(this.tempDir, 'newParams')
      await S3Utils.downloadFromBucket(
        this.s3Client,
        this.s3Bucket,
        client.id,
        newParamsDownloadPath,
      )

      // TODO: run verification and upload file instead of copy

      const destFile = 'params_' + latestParamNumber.toString().padStart(4, '0')
      await S3Utils.copyBucketObject(this.s3Client, this.s3Bucket, client.id, destFile)

      client.send({ method: 'contribution-verified', downloadLink: '' })
    } else {
      this.logger.info(`Client ${client.id} sent message: ${message}`)
    }
  }
}
