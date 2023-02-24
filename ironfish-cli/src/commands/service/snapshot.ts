/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { SnapshotManifest } from '../../snapshot'
import { S3Utils, TarUtils } from '../../utils'

const SNAPSHOT_FILE_NAME = `ironfish_snapshot.tar.gz`
const R2_SECRET_NAME = 'r2-prod-access-key'
const R2_ENDPOINT = `https://a93bebf26da4c2fe205f71c896afcf89.r2.cloudflarestorage.com`

export type R2Secret = {
  r2AccessKeyId: string
  r2SecretAccessKey: string
}

export default class Snapshot extends IronfishCommand {
  static hidden = true

  static description = `Upload chain snapshot to a public bucket`

  static flags = {
    ...LocalFlags,
    upload: Flags.boolean({
      default: false,
      allowNo: true,
      description:
        'Upload the snapshot to an S3 bucket. AWS credentials and region must be configured or set in the environment',
    }),
    bucket: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 bucket to upload snapshot to',
      default: 'ironfish-snapshots',
    }),
    path: Flags.string({
      char: 'p',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'The local path where the snapshot will be saved',
    }),
    webhook: Flags.string({
      char: 'w',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Webhook to notify on successful snapshot upload',
    }),
    r2: Flags.boolean({
      default: false,
      allowNo: true,
      description: 'Upload the snapshot to Cloudflare R2.',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Snapshot)

    const bucket = flags.bucket

    let exportDir

    if (flags.path) {
      exportDir = this.sdk.fileSystem.resolve(flags.path)
    } else {
      exportDir = this.sdk.fileSystem.resolve(this.sdk.config.tempDir)
    }

    await this.sdk.fileSystem.mkdir(exportDir, { recursive: true })

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    CliUx.ux.action.start(`Compacting chain database`)
    await node.chain.db.compact()
    CliUx.ux.action.stop()

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

      let s3 = new S3Client({})
      if (flags.r2) {
        const client = new SecretsManagerClient({})
        const command = new GetSecretValueCommand({ SecretId: R2_SECRET_NAME })

        this.log('Fetching secret from AWS Secrets Manager.')

        const response = await client.send(command)

        if (response.SecretString === undefined) {
          this.log(`Failed to fetch R2 secret from AWS.`)
          this.exit(1)
        } else {
          const secret = JSON.parse(response.SecretString) as R2Secret

          s3 = new S3Client({
            region: 'auto',
            endpoint: R2_ENDPOINT,
            credentials: {
              accessKeyId: secret.r2AccessKeyId,
              secretAccessKey: secret.r2SecretAccessKey,
            },
          })
        }
      }

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

      if (flags.webhook) {
        await axios.post(flags.webhook, {
          content: `Successfully uploaded Iron Fish snapshot at block ${node.chain.head.sequence}. Use \`ironfish chain:download\` to download and import the snapshot.`,
        })
      }
    }
  }
}
