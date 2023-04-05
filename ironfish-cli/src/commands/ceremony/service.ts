/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, setLogPrefixFromConfig } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { CeremonyServer } from '../../trusted-setup/server'
import { S3Utils } from '../../utils'

const CONTRIBUTE_TIMEOUT_MS = 5 * 60 * 1000
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000
const PRESIGNED_EXPIRATION_SEC = 5 * 60
const START_DATE = 1680904800000 // Friday, April 07 2023 15:00:00 GMT-0700 (Pacific Daylight Time)

export default class CeremonyService extends IronfishCommand {
  static hidden = true

  static description = `
     Start the coordination server for the Iron Fish trusted setup ceremony
   `

  static flags = {
    ...RemoteFlags,
    bucket: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3/R2 bucket to download and upload params to',
      default: 'ironfish-contributions',
    }),
    downloadPrefix: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Prefix for contribution download URLs',
      default: 'https://contributions.ironfish.network',
    }),
    contributionTimeoutMs: Flags.integer({
      required: false,
      description: 'Allowable milliseconds for a contributor to run the contribution script',
      default: CONTRIBUTE_TIMEOUT_MS,
    }),
    uploadTimeoutMs: Flags.integer({
      required: false,
      description: 'Allowable milliseconds for a contributor to upload their new parameters',
      default: UPLOAD_TIMEOUT_MS,
    }),
    presignedExpirationSec: Flags.integer({
      required: false,
      description:
        'How many seconds the S3/R2 pre-signed upload URL is valid for a contributor',
      default: PRESIGNED_EXPIRATION_SEC,
    }),
    startDate: Flags.integer({
      required: false,
      description: 'When should the server start accepting contributions',
      default: START_DATE,
    }),
    token: Flags.string({
      required: true,
    }),
    skipIPCheck: Flags.boolean({
      required: false,
      description: 'Pass this flag if you want to skip checking for duplicate IPs',
      default: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CeremonyService)

    const DEFAULT_HOST = '0.0.0.0'
    const DEFAULT_PORT = 9040

    const r2Credentials = await S3Utils.getR2Credentials('us-east-1')

    if (r2Credentials === undefined) {
      this.logger.log('Failed getting R2 credentials from AWS')
      this.exit(0)
      return
    }

    const r2Client = S3Utils.getR2S3Client(r2Credentials)

    setLogPrefixFromConfig(`[%tag%]`)

    const server = new CeremonyServer({
      logger: createRootLogger(),
      port: DEFAULT_PORT,
      host: DEFAULT_HOST,
      s3Bucket: flags.bucket,
      downloadPrefix: flags.downloadPrefix,
      s3Client: r2Client,
      tempDir: this.sdk.config.tempDir,
      contributionTimeoutMs: flags.contributionTimeoutMs,
      uploadTimeoutMs: flags.uploadTimeoutMs,
      presignedExpirationSec: flags.presignedExpirationSec,
      startDate: flags.startDate,
      token: flags.token,
      enableIPBanning: !flags.skipIPCheck,
    })

    await server.start()

    await server.waitForStop()
  }
}
