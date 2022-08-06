/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { SnapshotManifest } from '../../snapshot'
import { S3Utils, TarUtils } from '../../utils'

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
    bucket: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 bucket to upload snapshot to',
      default: 'ironfish-snapshots',
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

    const bucket = flags.bucket
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
    } else {
      exportDir = this.sdk.fileSystem.resolve(this.sdk.config.tempDir)
    }

    await this.sdk.fileSystem.mkdir(exportDir, { recursive: true })

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    const chainDatabasePath = this.sdk.fileSystem.resolve(this.sdk.config.chainDatabasePath)

    const timestamp = Date.now()

    const snapshotPath = this.sdk.fileSystem.join(exportDir, SNAPSHOT_FILE_NAME)

    this.log(`Zipping\n    SRC ${chainDatabasePath}\n    DST ${snapshotPath}\n`)
    CliUx.ux.action.start(`Zipping ${chainDatabasePath}`)
    await TarUtils.zipDir(chainDatabasePath + '/', snapshotPath)
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

      const s3 = new S3Client({
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region,
      })

      CliUx.ux.action.start(`Uploading to ${bucket}`)
      await S3Utils.uploadToBucket(
        s3,
        snapshotPath,
        'application/x-compressed-tar',
        bucket,
        snapshotKeyName,
        this.logger.withTag('s3'),
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
          CliUx.ux.action.start(`Uploading latest snapshot information to ${bucket}`)
          await S3Utils.uploadToBucket(
            s3,
            manifestPath,
            'application/json',
            bucket,
            'manifest.json',
            this.logger.withTag('s3'),
          )
          CliUx.ux.action.stop(`done`)
        })

      this.log('Snapshot upload complete. Uploaded the following manifest:')
      this.log(JSON.stringify(manifest, undefined, '  '))
    }
  }
}
