/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Assert, DEFAULT_SNAPSHOT_BUCKET_URL, FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import tar from 'tar'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { SnapshotManifest } from '../../utils'

// AWS requires that upload parts be at least 5MB
const MINIMUM_MULTIPART_FILE_SIZE = 5 * 1024 * 1024
const MAX_MULTIPART_NUM = 10000
const SNAPSHOT_FILE_NAME = `ironfish_snapshot.tar.gz`

export default class CreateSnapshot extends IronfishCommand {
  static hidden = true

  static description = `Upload chain snapshot to a public bucket`

  static flags = {
    ...LocalFlags,
    upload: Flags.boolean({
      default: false,
      allowNo: true,
    }),
    bucketUrl: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 bucket URL to upload snapshot to',
    }),
    accessKeyId: Flags.string({
      char: 'a',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 access key ID',
    }),
    secretAccessKey: Flags.string({
      char: 's',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 secret access key',
    }),
    region: Flags.string({
      char: 'r',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'AWS region where bucket is contained',
    }),
    path: Flags.string({
      char: 'p',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The path where the snapshot should be saved',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSnapshot)

    const bucketUrl = (flags.bucketUrl || DEFAULT_SNAPSHOT_BUCKET_URL || '').trim()
    const accessKeyId = (flags.accessKeyId || process.env.AWS_ACCESS_KEY_ID || '').trim()
    const secretAccessKey = (
      flags.secretAccessKey ||
      process.env.AWS_SECRET_ACCESS_KEY ||
      ''
    ).trim()
    const region = (flags.region || process.env.AWS_REGION || '').trim()

    let exportDir

    if (flags.path) {
      exportDir = this.sdk.fileSystem.resolve(flags.path)
      await this.sdk.fileSystem.mkdir(exportDir, { recursive: true })
    } else {
      try {
        const tempDir = this.sdk.fileSystem.resolve(this.sdk.config.tempDir)
        exportDir = await fsAsync.mkdir(tempDir, { recursive: true })
      } catch (err) {
        this.log(`Could not create temp folder for snapshot generation`)
        this.exit(1)
      }
    }
    Assert.isNotUndefined(exportDir)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    const chainDatabasePath = this.sdk.fileSystem.resolve(this.sdk.config.chainDatabasePath)

    const timestamp = Date.now()

    const snapshotPath = this.sdk.fileSystem.join(exportDir, SNAPSHOT_FILE_NAME)

    this.log(`Zipping\n    SRC ${chainDatabasePath}\n    DST ${snapshotPath}\n`)
    CliUx.ux.action.start(`Zipping ${chainDatabasePath}`)
    await this.zipDir(chainDatabasePath + '/', snapshotPath)
    const stat = await fsAsync.stat(snapshotPath)
    const fileSize = stat.size
    CliUx.ux.action.stop(`done (${FileUtils.formatFileSize(fileSize)})`)

    const hasher = crypto.createHash('sha256')
    const fileHandle = await fsAsync.open(snapshotPath, 'r')
    const stream = fileHandle.createReadStream()

    CliUx.ux.action.start(`Creating checksum for ${snapshotPath}`)
    for await (const data of stream) {
      hasher.update(data)
    }
    const checksum = hasher.digest().toString('hex')
    CliUx.ux.action.stop(`done (${checksum})`)

    if (flags.upload) {
      const snapshotBaseName = path.basename(SNAPSHOT_FILE_NAME, '.tar.gz')
      const snapshotKeyName = `${snapshotBaseName}_${timestamp}.tar.gz`
      CliUx.ux.action.start(`Uploading to ${bucketUrl}`)
      await this.uploadToBucket(
        snapshotPath,
        'application/x-compressed-tar',
        bucketUrl,
        snapshotKeyName,
        accessKeyId,
        secretAccessKey,
        region,
      )
      CliUx.ux.action.stop(`done`)

      const manifestPath = this.sdk.fileSystem.join(exportDir, 'manifest.json')
      const manifest: SnapshotManifest = {
        block_sequence: node.chain.head.sequence,
        checksum,
        file_name: snapshotKeyName,
        file_size: fileSize,
        timestamp,
        database_version: await node.chain.db.getVersion(),
      }

      await fsAsync
        .writeFile(manifestPath, JSON.stringify(manifest, undefined, '  '))
        .then(async () => {
          CliUx.ux.action.start(`Uploading latest snapshot information to ${bucketUrl}`)
          await this.uploadToBucket(
            manifestPath,
            'application/json',
            bucketUrl,
            manifestPath,
            accessKeyId,
            secretAccessKey,
            region,
          )
          CliUx.ux.action.stop(`done`)
        })

      this.log('Snapshot upload complete. Uploaded the following manifest:')
      this.log(JSON.stringify(manifest, undefined, '  '))
    }
  }

  async zipDir(source: string, dest: string, excludes: string[] = []): Promise<void> {
    const sourceDir = path.dirname(source)
    const sourceFile = path.basename(source)
    const excludeSet = new Set(excludes)

    await tar.create(
      {
        gzip: true,
        file: dest,
        C: sourceDir,
        filter: function (path) {
          if (excludeSet.has(path)) {
            return false
          } else {
            return true
          }
        },
      },
      [sourceFile],
    )
  }

  async uploadToBucket(
    filePath: string,
    contentType: string,
    bucketUrl: string,
    keyName: string,
    accessKeyId: string,
    secretAccessKey: string,
    region: string,
  ): Promise<void> {
    // The config value for the snapshot bucket contains the entire URL
    // but the S3 client only requires the bucket name.
    const bucket = new URL(bucketUrl).hostname.split('.')[0]

    const fileHandle = await fsAsync.open(filePath, 'r')

    const stat = await fsAsync.stat(filePath)
    const fileSize = stat.size
    let numParts = MAX_MULTIPART_NUM

    while (fileSize / numParts < MINIMUM_MULTIPART_FILE_SIZE) {
      numParts /= 2
    }

    const uploadChunkSize = fileSize / numParts

    const contentStream = fileHandle.createReadStream()

    const s3 = new S3Client({
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      region,
    })

    const params = {
      Bucket: bucket,
      Key: keyName,
      ContentType: contentType,
    }

    const uploadId = await s3
      .send(new CreateMultipartUploadCommand(params))
      .then((result) => result.UploadId)
      .catch((err: Error) => {
        this.logger.error(`Could not create multipart upload to S3: ${err.message}`)
        throw new Error(err.message)
      })

    Assert.isNotUndefined(uploadId)

    const uploadPartsPromise = new Promise<{
      Parts: { ETag: string | undefined; PartNumber: number }[]
    }>((resolve, reject) => {
      const partMap: { Parts: { ETag: string | undefined; PartNumber: number }[] } = {
        Parts: [],
      }

      let partNum = 1
      let acc: Buffer | null = null

      contentStream.on('data', (chunk: Buffer) => {
        if (!acc) {
          acc = chunk
        } else {
          acc = Buffer.concat([acc, chunk])
        }

        if (acc.length > uploadChunkSize) {
          contentStream.pause()

          const params = {
            Bucket: bucket,
            Key: keyName,
            PartNumber: partNum,
            UploadId: uploadId,
            ContentType: contentType,
            Body: acc,
          }

          s3.send(new UploadPartCommand(params))
            .then((result) => {
              partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
              partNum += 1
              acc = null
              contentStream.resume()
            })
            .catch((err: Error) => {
              this.logger.error(`Could not upload part to S3 bucket: ${err.message}`)
              reject(err)
            })
        }
      })

      contentStream.on('close', () => {
        if (acc) {
          const params = {
            Bucket: bucket,
            Key: keyName,
            PartNumber: partNum,
            UploadId: uploadId,
            ContentType: contentType,
            Body: acc,
          }

          s3.send(new UploadPartCommand(params))
            .then((result) => {
              partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
              acc = null
              resolve(partMap)
            })
            .catch((err: Error) => {
              this.logger.error(`Could not upload last part to S3 bucket: ${err.message}`)
              reject(err)
            })
        }
      })

      contentStream.on('error', (err) => {
        this.logger.error(`Could not read file: ${err.message}; aborting upload to S3...`)
        const params = {
          Bucket: bucket,
          Key: keyName,
          UploadId: uploadId,
        }

        s3.send(new AbortMultipartUploadCommand(params))
          .then()
          .catch((awsErr: Error) => {
            this.logger.error(`Could not abort S3 upload: ${awsErr.message}`)
          })

        reject(err)
      })
    })

    const partMap = await uploadPartsPromise

    this.logger.debug(
      `All parts of snapshot have been uploaded. Finalizing multipart upload. Parts: ${partMap.Parts.length}`,
    )

    const completionParams = {
      Bucket: bucket,
      Key: keyName,
      UploadId: uploadId,
      MultipartUpload: partMap,
    }

    await s3
      .send(new CompleteMultipartUploadCommand(completionParams))
      .then(() => {
        this.logger.info(`Multipart upload complete.`)
      })
      .catch((err: Error) => {
        throw new Error(`Could not complete multipart S3 upload: ${err.message}`)
      })
  }
}
