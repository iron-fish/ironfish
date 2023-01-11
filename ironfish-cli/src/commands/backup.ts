/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CognitoIdentity } from '@aws-sdk/client-cognito-identity'
import { S3Client } from '@aws-sdk/client-s3'
import { Credentials } from '@aws-sdk/types/dist-types/credentials'
import { Assert, FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { S3Utils, TarUtils } from '../utils'

export default class Backup extends IronfishCommand {
  static hidden = true
  static description = 'Zip and upload your datadir to an S3 bucket'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    lock: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Wait for the database to stop being used',
    }),
    chain: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Backup the chain DB',
    }),
    wallet: Flags.boolean({
      default: false,
      allowNo: true,
      description: 'Backup the wallet',
    }),
    accessKeyId: Flags.string({
      char: 'a',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 access key ID',
      env: 'AWS_ACCESS_KEY_ID',
      dependsOn: ['secretAccessKey'],
    }),
    secretAccessKey: Flags.string({
      char: 's',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'S3 secret access key',
      env: 'AWS_SECRET_ACCESS_KEY',
      dependsOn: ['accessKeyId'],
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
    const { flags, args } = await this.parse(Backup)
    const bucket = (args.bucket as string).trim()

    const accessKeyId = flags.accessKeyId
    const secretAccessKey = flags.secretAccessKey

    let id = uuid().slice(0, 5)
    const name = this.sdk.config.get('nodeName')
    if (name) {
      id = `${name}.${id}`
    }

    if (flags.lock) {
      const node = await this.sdk.node({ autoSeed: false })
      await NodeUtils.waitForOpen(node)
    }

    const source = this.sdk.config.dataDir

    const destDir = this.sdk.config.tempDir
    await fsAsync.mkdir(destDir, { recursive: true })

    const destName = `node.${id}.tar.gz`
    const dest = path.join(destDir, destName)

    this.log(`Zipping\n    SRC ${source}\n    DST ${dest}\n`)
    CliUx.ux.action.start(`Zipping ${source}`)

    const excludes = [path.basename(this.sdk.config.tempDir)]

    if (!flags.chain) {
      excludes.push(path.basename(path.dirname(this.sdk.config.chainDatabasePath)))
    }

    if (!flags.wallet) {
      excludes.push(path.basename(path.dirname(this.sdk.config.walletDatabasePath)))
    }

    await TarUtils.zipDir(source, dest, excludes)

    const stat = await fsAsync.stat(dest)
    CliUx.ux.action.stop(`done (${FileUtils.formatFileSize(stat.size)})`)

    CliUx.ux.action.start(`Uploading to ${bucket}`)

    const s3 = await this.getS3Client(accessKeyId, secretAccessKey)

    await S3Utils.uploadToBucket(
      s3,
      dest,
      'application/x-compressed-tar',
      bucket,
      destName,
      this.logger.withTag('s3'),
    )
    CliUx.ux.action.stop(`done`)

    CliUx.ux.action.start(`Removing backup file ${dest}`)
    await fsAsync.rm(dest)
    CliUx.ux.action.stop(`done`)
  }

  private async getS3Client(accessKeyId?: string, secretAccessKey?: string): Promise<S3Client> {
    const region = 'us-east-1'

    if (accessKeyId && secretAccessKey) {
      return new S3Client({
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
        region,
      })
    }

    const credentials = await this.getCognitoIdentityCredentials()

    return new S3Client({
      credentials,
      region,
    })
  }

  private async getCognitoIdentityCredentials(): Promise<Credentials> {
    const identityPoolId = 'us-east-1:3ebc542a-6ac4-4c5d-9558-1621eadd2382'

    const cognito = new CognitoIdentity({})

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
