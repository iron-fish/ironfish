/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { S3Client } from '@aws-sdk/client-s3'
import { FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import fsAsync from 'fs/promises'
import os from 'os'
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
      description: 'wait for the database to stop being used',
    }),
    chain: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'export the chain DB',
    }),
    accounts: Flags.boolean({
      default: false,
      allowNo: true,
      description: 'export the accounts',
    }),
    mined: Flags.boolean({
      default: false,
      allowNo: true,
      description: 'export the mined block index',
    }),
  }

  static args = [
    {
      name: 'bucket',
      required: true,
      description: 'the S3 bucket to upload to',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Backup)
    const bucket = (args.bucket as string).trim()

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
    const destDir = await fsAsync.mkdtemp(path.join(os.tmpdir(), `ironfish.backup`))
    const destName = `node.${id}.tar.gz`
    const dest = path.join(destDir, destName)

    this.log(`Zipping\n    SRC ${source}\n    DST ${dest}\n`)
    CliUx.ux.action.start(`Zipping ${source}`)

    const excludes = [path.basename(this.sdk.config.tempDir)]

    if (!flags.chain) {
      excludes.push(path.basename(path.dirname(this.sdk.config.chainDatabasePath)))
    }

    if (!flags.accounts) {
      excludes.push(path.basename(path.dirname(this.sdk.config.accountDatabasePath)))
    }

    if (!flags.mined) {
      excludes.push(path.basename(path.dirname(this.sdk.config.indexDatabasePath)))
    }

    await TarUtils.zipDir(source, dest, excludes)

    const stat = await fsAsync.stat(dest)
    CliUx.ux.action.stop(`done (${FileUtils.formatFileSize(stat.size)})`)

    CliUx.ux.action.start(`Uploading to ${bucket}`)
    const s3 = new S3Client({ region: 'us-east-1' })
    await S3Utils.uploadToBucket(
      s3,
      dest,
      'application/x-compressed-tar',
      bucket,
      destName,
      this.logger.withTag('s3'),
    )
    CliUx.ux.action.stop(`done`)

    CliUx.ux.action.start(`Removing backup dir ${destDir}`)
    await fsAsync.rm(destDir, { recursive: true })
    CliUx.ux.action.stop(`done`)
  }
}
