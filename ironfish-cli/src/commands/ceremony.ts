/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { contribute } from '@ironfish/rust-nodejs'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import fsAsync from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { CeremonyClient } from '../trusted-setup/client'
import { S3Utils } from '../utils'

export default class Ceremony extends IronfishCommand {
  static description = 'Contribute randomness to the Iron Fish trusted setup'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    host: Flags.string({
      parse: (input: string) => Promise.resolve(input.trim()),
      default: '127.0.0.1',
      description: 'Host address of the ceremony coordination server',
    }),
    port: Flags.integer({
      default: 9040,
      description: 'Port of the ceremony coordination server',
    }),
  }

  static args = [
    {
      name: 'bucket',
      required: true,
      description: 'The S3 bucket to upload to',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Ceremony)
    const bucket = (args.bucket as string).trim()
    const { host, port } = flags

    // Start the client
    const client = new CeremonyClient({
      host,
      port,
      logger: this.logger.withTag('ceremonyClient'),
    })

    CliUx.ux.action.start('Connecting')
    const connected = await client.start()
    CliUx.ux.action.stop()

    if (!connected) {
      this.error('Unable to connect to contribution server.')
    }

    // Join the queue
    client.join()

    // Pre-make the directories to check for access
    const tempDir = this.sdk.config.tempDir
    await fsAsync.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'params')
    const outputPath = path.join(tempDir, 'newParams')

    CliUx.ux.action.start('Waiting to contribute', undefined, { stdout: true })

    client.onJoined.on(({ queueLocation }) => {
      CliUx.ux.action.status = `Current position: ${queueLocation}`
    })

    client.onInitiateContribution.on(async ({ downloadLink }) => {
      CliUx.ux.action.stop()

      const credentials = await S3Utils.getCognitoIdentityCredentials()
      const s3 = S3Utils.getS3Client(true, credentials)

      CliUx.ux.action.start(`Downloading params to ${inputPath}`)

      await S3Utils.downloadFromBucket(s3, bucket, 'params', inputPath)

      CliUx.ux.action.stop(`done`)

      CliUx.ux.action.start(`Generating contribution`)

      const hash = await contribute(inputPath, outputPath)

      CliUx.ux.action.stop(`done`)

      this.log(`Done! Your contribution has been written to \`${outputPath}\`.`)
      this.log(`The contribution you made is bound to the following hash:\n${hash}`)

      client.contributionComplete()
    })

    client.onInitiateUpload.on(async ({ uploadLink }) => {
      this.log('Received upload link.')

      CliUx.ux.action.start(`Uploading params`)

      const fileHandle = await fsAsync.open(outputPath, 'r')
      const stat = await fsAsync.stat(outputPath)

      try {
        await axios.put(uploadLink, fileHandle.createReadStream(), {
          maxBodyLength: 1000000000,
          responseType: 'text',
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
          },
          onUploadProgress: (p: ProgressEvent) => {
            this.log('loaded', p.loaded, 'total', p.total)
          },
        })
      } catch (e) {
        this.log(e)
      }

      CliUx.ux.action.stop()
      client.uploadComplete()

      this.log('Contributions received. Thank you!')
      client.stop()
      this.exit(0)
    })

    await client.waitForStop()
  }
}
