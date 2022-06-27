/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, AsyncUtils, FileUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { AWSError, S3 } from 'aws-sdk'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

const UPLOAD_CHUNK_SIZE = 10 * 1024 * 1024 // 10 MB

export default class CreateSnapshot extends IronfishCommand {
  static hidden = true

  static description = `Upload chain snapshot to a public bucket`

  static flags = {
    ...RemoteFlags,
    bucket: Flags.string({
      char: 'e',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Bucket URL to upload snapshot to',
    }),
    path: Flags.string({
      char: 'p',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The path where the snapshot should be saved',
    }),
    maxBlocksPerChunk: Flags.integer({
      char: 'm',
      required: false,
      default: isNaN(Number(process.env.MAX_BLOCKS_PER_SNAPSHOT_CHUNK))
        ? 1000
        : Number(process.env.MAX_BLOCKS_PER_SNAPSHOT_CHUNK),
      description: 'The max number of blocks per file in the zipped snapshot',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CreateSnapshot)

    const bucket = (flags.bucket || process.env.IRONFISH_SNAPSHOT_BUCKET || '').trim()

    let exportDir

    if (flags.path) {
      exportDir = this.sdk.fileSystem.resolve(flags.path)
    } else {
      try {
        exportDir = await fsAsync.mkdtemp(`${os.tmpdir()}${path.sep}`)
      } catch (err) {
        this.log(`Could not create temp folder for snapshot generation`)
        this.exit(1)
      }
    }
    Assert.isNotUndefined(exportDir)

    const blockExportPath = this.sdk.fileSystem.join(exportDir, 'blocks')
    await this.sdk.fileSystem.mkdir(blockExportPath, { recursive: true })

    this.log('Connecting to node...')

    // TODO: There's a significant slowdown in the export process when running a
    // full node. This may be due to CPU starvation or message formatting calls
    // due to the use of node-ipc. We should revisit this in the future to allow
    // for export without shutting down the node. -- deekerno
    const client = await this.sdk.connectRpc(true)

    const response = client.snapshotChainStream({
      maxBlocksPerChunk: flags.maxBlocksPerChunk,
    })

    const { start, stop } = await AsyncUtils.first(response.contentStream())
    this.log(`Retrieving blocks from ${start} -> ${stop} for snapshot generation`)

    const progress = CliUx.ux.progress({
      format: 'Retrieving blocks: [{bar}] {value}/{total} {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(stop - start + 1, 0)

    for await (const result of response.contentStream()) {
      if (result.buffer && result.seq) {
        const blockFilePath = this.sdk.fileSystem.join(blockExportPath, `${result.seq}`)
        await fsAsync.writeFile(blockFilePath, Buffer.from(result.buffer))
        progress.update(result.seq || 0)
      }
    }

    progress.stop()

    const timestamp = Date.now()

    const snapshotFileName = `ironfish_snapshot_${timestamp}.tar.gz`
    const snapshotPath = this.sdk.fileSystem.join(exportDir, snapshotFileName)

    this.log(`Zipping\n    SRC ${blockExportPath}\n    DST ${snapshotPath}\n`)
    CliUx.ux.action.start(`Zipping ${blockExportPath}`)
    await this.zipDir(blockExportPath, snapshotPath)
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

    if (bucket) {
      const blockHeight = stop

      CliUx.ux.action.start(`Uploading to ${bucket}`)
      await this.uploadToBucket(snapshotPath, bucket, 'application/x-compressed-tar')
      CliUx.ux.action.stop(`done`)

      const manifestPath = path.join(exportDir, 'manifest.json')

      await fsAsync
        .writeFile(
          manifestPath,
          JSON.stringify({
            block_height: blockHeight,
            checksum,
            file_name: snapshotFileName,
            file_size: fileSize,
            timestamp,
          }),
        )
        .then(async () => {
          CliUx.ux.action.start(`Uploading latest snapshot information to ${bucket}`)
          await this.uploadToBucket(manifestPath, bucket, 'application/json')
          CliUx.ux.action.stop(`done`)
        })
    }
  }

  zipDir(source: string, dest: string, excludes: string[] = []): Promise<number | null> {
    return new Promise<number | null>((resolve, reject) => {
      const sourceDir = path.dirname(source)
      const sourceFile = path.basename(source)

      const args = ['-zcf', dest, '-C', sourceDir, sourceFile]

      for (const exclude of excludes) {
        args.unshift(exclude)
        args.unshift('--exclude')
      }

      const process = spawn('tar', args)
      process.on('exit', (code) => resolve(code))
      process.on('close', (code) => resolve(code))
      process.on('error', (error) => reject(error))
    })
  }

  async uploadToBucket(filePath: string, bucket: string, contentType: string): Promise<void> {
    const baseName = path.basename(filePath)

    const s3 = new S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    })

    const params = {
      Bucket: bucket,
      Key: baseName,
      ContentType: contentType,
    }

    const uploadId = await s3
      .createMultipartUpload(params)
      .promise()
      .then((result) => result.UploadId)
      .catch((err: AWSError) => {
        this.logger.error(`Could not create multipart upload to S3: ${err.message}`)
        throw new Error(err.message)
      })
    Assert.isNotUndefined(uploadId)

    const fileHandle = await fsAsync.open(filePath, 'r')
    const contentStream = fileHandle.createReadStream()

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

        if (acc.length > UPLOAD_CHUNK_SIZE) {
          contentStream.pause()

          const chunkSize = acc.length / 1024 / 1024

          const params = {
            Bucket: bucket,
            Key: baseName,
            PartNumber: partNum,
            UploadId: uploadId,
            ContentType: contentType,
            Body: acc,
            ContentLength: chunkSize,
          }

          s3.uploadPart(params)
            .promise()
            .then((result) => {
              partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
              partNum += 1
              acc = null
              contentStream.resume()
            })
            .catch((err: AWSError) => {
              this.logger.error(`Could not upload part to S3 bucket: ${err.message}`)
              reject(err)
            })
        }
      })

      contentStream.on('close', () => {
        if (acc) {
          const chunkSize = acc.length / 1024 / 1024

          const params = {
            Bucket: bucket,
            Key: baseName,
            PartNumber: partNum,
            UploadId: uploadId,
            ContentType: contentType,
            Body: acc,
            ContentLength: chunkSize,
          }

          s3.uploadPart(params)
            .promise()
            .then((result) => {
              partMap.Parts.push({ ETag: result.ETag, PartNumber: params.PartNumber })
              acc = null
              resolve(partMap)
            })
            .catch((err: AWSError) => {
              this.logger.error(`Could not upload last part to S3 bucket: ${err.message}`)
              reject(err)
            })
        }
      })

      contentStream.on('error', (err) => {
        this.logger.error(err.message)
        reject(err)
      })
    })

    const partMap = await uploadPartsPromise

    this.logger.debug(
      `All parts of snapshot have been uploaded. Finalizing multipart upload. Parts: ${partMap.Parts.length}`,
    )

    const completionParams = {
      Bucket: bucket,
      Key: baseName,
      UploadId: uploadId,
      MultipartUpload: partMap,
    }

    await s3
      .completeMultipartUpload(completionParams)
      .promise()
      .then(() => {
        this.logger.info(`Multipart upload complete.`)
      })
      .catch((err: AWSError) => {
        throw new Error(`Could not complete multipart S3 upload: ${err.message}`)
      })
  }
}
