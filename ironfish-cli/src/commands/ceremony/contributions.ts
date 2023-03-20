/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../command'
import { S3Utils } from '../../utils'

export default class CeremonyContributions extends IronfishCommand {
  static description = 'List all the current contributions with names'

  static flags = {
    start: Flags.integer({
      required: false,
    }),
    end: Flags.integer({
      required: false,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(CeremonyContributions)

    const r2Credentials = await S3Utils.getR2Credentials()

    if (r2Credentials === undefined) {
      this.logger.log('Failed getting R2 credentials from AWS')
      this.exit(0)
      return
    }

    const r2Client = S3Utils.getR2S3Client(r2Credentials)

    const latestParamName = await this.getLatestParamName(r2Client, 'ironfish-contributions')
    const latestParamNumber = parseInt(latestParamName.split('_')[1])
    const keys: string[] = [...new Array<number>(latestParamNumber + 1)]
      .map((_, i) => i)
      .filter((i) => (!flags.start || i >= flags.start) && (!flags.end || i <= flags.end))
      .map((i) => {
        return 'params_' + i.toString().padStart(5, '0')
      })

    for (const key of keys) {
      const { Metadata } = await S3Utils.getObjectMetadata(
        r2Client,
        'ironfish-contributions',
        key,
      )
      this.log(
        `Contribution: ${key.split('_')[1]}, Name: ${Metadata?.contributorName || '-'}, IP: ${
          Metadata?.remoteaddress || '-'
        }`,
      )
    }
  }

  async getLatestParamName(client: S3Client, bucket: string): Promise<string> {
    const paramFileNames = await S3Utils.getBucketObjects(client, bucket)
    const validParams = paramFileNames
      .slice(0)
      .filter((fileName) => /^params_\d{5}$/.test(fileName))
    validParams.sort()
    return validParams[validParams.length - 1]
  }
}
