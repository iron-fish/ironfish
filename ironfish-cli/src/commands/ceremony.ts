/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { contribute } from '@ironfish/rust-nodejs'
import { ErrorUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import fsAsync from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { CeremonyClient } from '../trusted-setup/client'

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

  async start(): Promise<void> {
    const { flags } = await this.parse(Ceremony)
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

    // Pre-make the directories to check for access
    const tempDir = this.sdk.config.tempDir
    await fsAsync.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'params')
    const outputPath = path.join(tempDir, 'newParams')

    CliUx.ux.action.start('Waiting to contribute', undefined, { stdout: true })

    client.onJoined.on(({ queueLocation }) => {
      CliUx.ux.action.status = `Current position: ${queueLocation}`
    })

    client.onInitiateContribution.on(async ({ downloadLink, contributionNumber }) => {
      CliUx.ux.action.stop()

      this.log(`Starting contribution. You are contributor #${contributionNumber}`)

      CliUx.ux.action.start(`Downloading params to ${inputPath}`)

      const fileHandle = await fsAsync.open(inputPath, 'w')

      let response
      try {
        response = await axios.get(downloadLink, {
          responseType: 'stream',
          onDownloadProgress: (p: ProgressEvent) => {
            this.log('loaded', p.loaded, 'total', p.total)
          },
        })
      } catch (e) {
        this.error(ErrorUtils.renderError(e))
      }

      await pipeline(response.data, fileHandle.createWriteStream())

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
        this.log(ErrorUtils.renderError(e))
      }

      CliUx.ux.action.stop()
      client.uploadComplete()

      CliUx.ux.action.start('Contribution uploaded. Waiting for server to verify')
    })

    client.onContributionVerified.on(({ hash }) => {
      CliUx.ux.action.stop()
      this.log(`Server verified contribution with hash:\n${hash}`)

      if (hash === localHash) {
        this.log('Thank you for your contribution!')
        client.stop()
        this.exit(0)
      } else {
        this.error(
          'Hashes do not match. Please contact the Iron Fish team with this error message.',
        )
      }
    })

    await client.waitForStop()
  }
}
