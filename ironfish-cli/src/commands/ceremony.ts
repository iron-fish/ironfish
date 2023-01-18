/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { CognitoIdentity } from '@aws-sdk/client-cognito-identity'
import { S3Client } from '@aws-sdk/client-s3'
import { Credentials } from '@aws-sdk/types/dist-types/credentials'
import { contribute } from '@ironfish/rust-nodejs'
import { BenchUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { S3Utils, TarUtils } from '../utils'

export default class Ceremony extends IronfishCommand {
  static description = 'Contribute randomness to the Iron Fish trusted setup'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Ceremony)

    const tempDir = this.sdk.config.tempDir
    await fsAsync.mkdir(tempDir, { recursive: true })

    const inputPath = path.join(tempDir, 'params')
    const outputPath = path.join(tempDir, 'newParams')
    this.log(`Opening ${inputPath}`)

    CliUx.ux.action.start(`Generating contribution`)

    const hash = await contribute(inputPath, outputPath)

    CliUx.ux.action.stop(`done`)

    this.log(`Done! Your contribution has been written to \`${outputPath}\`.`)
    this.log(`The contribution you made is bound to the following hash:\n${hash}`)
  }
}
