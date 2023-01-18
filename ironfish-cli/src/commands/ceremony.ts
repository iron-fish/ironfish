/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CognitoIdentity } from '@aws-sdk/client-cognito-identity'
import { S3Client } from '@aws-sdk/client-s3'
import { Credentials } from '@aws-sdk/types/dist-types/credentials'
import { contribute } from '@ironfish/rust-nodejs'
import { Assert } from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import fsAsync from 'fs/promises'
import path from 'path'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { S3Utils } from '../utils'

export default class Ceremony extends IronfishCommand {
  static description = 'Contribute randomness to the Iron Fish trusted setup'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  static args = [
    {
      name: 'bucket',
      required: true,
      description: 'The S3 bucket to upload to',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(Ceremony)
    const bucket = (args.bucket as string).trim()

    const s3 = await this.getS3Client()

    const tempDir = this.sdk.config.tempDir
    await fsAsync.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'params')
    const outputPath = path.join(tempDir, 'newParams')

    CliUx.ux.action.start(`Downloading params to ${inputPath}`)

    await S3Utils.downloadFromBucket(s3, bucket, 'params', inputPath)

    CliUx.ux.action.stop(`done`)

    CliUx.ux.action.start(`Generating contribution`)

    const hash = await contribute(inputPath, outputPath)

    CliUx.ux.action.stop(`done`)

    this.log(`Done! Your contribution has been written to \`${outputPath}\`.`)
    this.log(`The contribution you made is bound to the following hash:\n${hash}`)

    CliUx.ux.action.start(`Uploading params`)

    await S3Utils.uploadToBucket(
      s3,
      outputPath,
      'application/octet-stream',
      bucket,
      'newParams',
      this.logger.withTag('s3'),
    )

    CliUx.ux.action.stop('done')

    this.log('Contributions received. Thank you!')
  }

  private async getS3Client(accessKeyId?: string, secretAccessKey?: string): Promise<S3Client> {
    const region = 'us-east-1'

    if (accessKeyId && secretAccessKey) {
      return new S3Client({
        useAccelerateEndpoint: true,
        useDualstackEndpoint: true,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region,
      })
    }

    const credentials = await this.getCognitoIdentityCredentials()

    return new S3Client({
      useAccelerateEndpoint: true,
      credentials,
      region,
    })
  }

  private async getCognitoIdentityCredentials(): Promise<Credentials> {
    const identityPoolId = 'us-east-1:3ebc542a-6ac4-4c5d-9558-1621eadd2382'

    const cognito = new CognitoIdentity({ region: 'us-east-1' })

    const identityResponse = await cognito.getId({ IdentityPoolId: identityPoolId })

    const identityId = identityResponse.IdentityId

    const credentialsResponse = await cognito.getCredentialsForIdentity({
      IdentityId: identityId,
    })

    const cognitoAccessKeyId = credentialsResponse.Credentials?.AccessKeyId
    const cognitoSecretAccessKey = credentialsResponse.Credentials?.SecretKey
    const cognitoSessionToken = credentialsResponse.Credentials?.SessionToken

    Assert.isNotUndefined(cognitoAccessKeyId)
    Assert.isNotUndefined(cognitoSecretAccessKey)
    Assert.isNotUndefined(cognitoSessionToken)

    return {
      accessKeyId: cognitoAccessKeyId,
      secretAccessKey: cognitoSecretAccessKey,
      sessionToken: cognitoSessionToken,
    }
  }
}
