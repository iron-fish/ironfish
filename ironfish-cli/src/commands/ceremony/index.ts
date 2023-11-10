/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { contribute } from '@ironfish/rust-nodejs'
import { ErrorUtils, PromiseUtils, TimeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import fsAsync from 'fs/promises'
import path from 'path'
import { pipeline } from 'stream/promises'
import { IronfishCommand } from '../../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../../flags'
import { CeremonyClient } from '../../trusted-setup/client'

export default class Ceremony extends IronfishCommand {
  static description = 'Contribute randomness to the Iron Fish trusted setup'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    host: Flags.string({
      parse: (input: string) => Promise.resolve(input.trim()),
      default: 'ceremony.ironfish.network',
      description: 'Host address of the ceremony coordination server',
    }),
    port: Flags.integer({
      default: 9040,
      description: 'Port of the ceremony coordination server',
    }),
    token: Flags.string({
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Ceremony)
    const { host, port } = flags

    // Pre-make the temp directory to check for access
    const tempDir = this.sdk.config.tempDir
    await fsAsync.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'params')
    const outputPath = path.join(tempDir, 'newParams')

    let localHash: string | null = null
    let refreshEtaInterval: NodeJS.Timeout | null = null
    let etaDate: Date | null = null

    // Prompt for randomness
    let randomness: string | null = await CliUx.ux.prompt(
      `If you'd like to contribute your own randomness to the ceremony, type it here, then press Enter. For more information on where this should come from and its importance, please read https://setup.ironfish.network. If you'd like the command to generate some randomness for you, just press Enter`,
      { required: false },
    )
    randomness = randomness.length ? randomness : null

    const name = await CliUx.ux.prompt(
      `If you'd like to associate a name with this contribution, type it here, then press Enter. Otherwise, to contribute anonymously, just press Enter`,
      { required: false },
    )

    // Create the client and bind events
    const client = new CeremonyClient({
      host,
      port,
      logger: this.logger.withTag('ceremonyClient'),
    })

    client.onJoined.on(({ queueLocation, estimate }) => {
      refreshEtaInterval && clearInterval(refreshEtaInterval)

      etaDate = new Date(Date.now() + estimate)

      CliUx.ux.action.status = renderStatus(queueLocation, etaDate)
      refreshEtaInterval = setInterval(() => {
        CliUx.ux.action.status = renderStatus(queueLocation, etaDate)
      }, 10 * 1000)

      CliUx.ux.action.status = `Current position: ${queueLocation}`
    })

    client.onInitiateContribution.on(async ({ downloadLink, contributionNumber }) => {
      CliUx.ux.action.stop()
      refreshEtaInterval && clearInterval(refreshEtaInterval)

      this.log(`Starting contribution. You are contributor #${contributionNumber}`)

      CliUx.ux.action.start(`Downloading the previous contribution to ${inputPath}`)

      const fileHandle = await fsAsync.open(inputPath, 'w')

      let response
      try {
        response = await axios.get(downloadLink, {
          responseType: 'stream',
          onDownloadProgress: (p) => {
            this.log('loaded', p.loaded, 'total', p.total)
          },
        })
      } catch (e) {
        this.error(ErrorUtils.renderError(e))
      }

      // @ts-expect-error Would rather comment out the type error than change the code to fix it
      await pipeline(response.data, fileHandle.createWriteStream())

      CliUx.ux.action.stop()

      CliUx.ux.action.start(`Contributing your randomness`)

      localHash = await contribute(inputPath, outputPath, randomness)

      CliUx.ux.action.stop()

      CliUx.ux.action.start(`Waiting to upload your contribution`)

      client.contributionComplete()
    })

    client.onInitiateUpload.on(async ({ uploadLink }) => {
      CliUx.ux.action.stop()
      refreshEtaInterval && clearInterval(refreshEtaInterval)

      CliUx.ux.action.start(`Uploading your contribution`)

      const fileHandle = await fsAsync.open(outputPath, 'r')
      const stat = await fsAsync.stat(outputPath)

      try {
        await axios.put(uploadLink, fileHandle.createReadStream(), {
          // Axios requires specifying some max body length when uploading.
          // Set it high enough that we're not likely to hit it
          maxBodyLength: 1000000000,
          headers: {
            'Content-Type': 'application/octet-stream',
            'Content-Length': stat.size,
          },
        })
      } catch (e) {
        this.error(ErrorUtils.renderError(e))
      }

      CliUx.ux.action.stop()
      client.uploadComplete()

      CliUx.ux.action.start('Contribution uploaded. Waiting for server to verify')
    })

    client.onContributionVerified.on(({ hash, downloadLink, contributionNumber }) => {
      CliUx.ux.action.stop()
      refreshEtaInterval && clearInterval(refreshEtaInterval)

      if (!localHash) {
        this.log(
          `Server verified a contribution, but you haven't made a contribution yet. Server-generated hash:`,
        )
        this.log(display256CharacterHash(hash))
        this.error('Please contact the Iron Fish team with this error message.')
      }

      if (hash !== localHash) {
        this.log('Hashes do not match. Locally generated hash:')
        this.log(display256CharacterHash(localHash))
        this.log('Server-generated hash:')
        this.log(display256CharacterHash(hash))
        this.error('Please contact the Iron Fish team with this error message.')
      }

      this.log(
        `\nThank you for your contribution to the Iron Fish Ceremony. You have successfully contributed at position #${contributionNumber}. The public hash of your contribution is:`,
      )
      this.log(display256CharacterHash(hash))
      this.log(
        `This hash is a record of your contribution to the Iron Fish parameters, so you should save it to check later. You can view your contributed file at ${downloadLink}.`,
      )

      client.stop(true)
      this.exit(0)
    })

    client.onStopRetry.on(({ error }) => {
      CliUx.ux.action.stop()
      refreshEtaInterval && clearInterval(refreshEtaInterval)

      this.log(`Stopping contribution: ${error}`)

      client.stop(true)
    })

    // Retry connection until contributions are received
    let connected = false
    while (!connected) {
      CliUx.ux.action.start('Connecting')
      const error = await client.start()
      connected = error === null
      CliUx.ux.action.stop(error ? `Error connecting: ${error}` : 'done')

      if (!connected) {
        this.log('Unable to connect to contribution server. Retrying in 5 seconds.')
        await PromiseUtils.sleep(5000)
        continue
      }

      client.join(name, flags.token)

      CliUx.ux.action.start('Waiting to contribute', undefined, { stdout: true })

      const result = await client.waitForStop()
      connected = result.stopRetries

      if (!connected) {
        if (CliUx.ux.action.running) {
          CliUx.ux.action.stop('error')
        }
        this.log(
          `We're sorry, but your contribution either timed out or you lost connection. Attempting to connect again in 5 seconds.`,
        )
        await PromiseUtils.sleep(5000)
      }
    }
  }
}

const renderStatus = (queueLocation: number, etaDate: Date | null): string => {
  return `Current position: ${queueLocation} ${
    etaDate
      ? `(Estimated time remaining: ${TimeUtils.renderSpan(etaDate.getTime() - Date.now())})`
      : ''
  }`
}

const display256CharacterHash = (hash: string): string => {
  // split string every 8 characters
  let slices: string[] = hash.match(/.{1,8}/g) ?? []

  const output = []
  for (let i = 0; i < 4; i++) {
    output.push(`\t${slices.slice(0, 4).join(' ')}`)
    slices = slices.slice(4)
  }

  return `\n${output.join('\n')}\n`
}
