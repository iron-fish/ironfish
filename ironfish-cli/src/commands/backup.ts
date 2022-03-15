/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FileUtils, NodeUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { spawn } from 'child_process'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'

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
    accounts: Flags.boolean({
      default: false,
      allowNo: true,
      description: 'export the accounts',
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
    const dest = path.join(destDir, `node.${id}.tar.gz`)

    this.log(`Zipping\n    SRC ${source}\n    DST ${dest}\n`)
    CliUx.ux.action.start(`Zipping ${source}`)

    await this.zipDir(
      source,
      dest,
      flags.accounts ? [] : [path.basename(path.dirname(this.sdk.config.accountDatabasePath))],
    )

    const stat = await fsAsync.stat(dest)
    CliUx.ux.action.stop(`done (${FileUtils.formatFileSize(stat.size)})`)

    CliUx.ux.action.start(`Uploading to ${bucket}`)
    await this.uploadToS3(dest, bucket)
    CliUx.ux.action.stop(`done`)
  }

  zipDir(source: string, dest: string, excludes: string[] = []): Promise<number | null> {
    return new Promise<number | null>((resolve, reject) => {
      const sourceDir = path.dirname(source)
      const sourceFile = path.basename(source)

      const args = ['-zcf', dest, '-C', sourceDir, sourceFile]

      for (const exclude of excludes) {
        args.unshift(exclude)
        args.unshift('--exclude')
      }

      const process = spawn('tar', args)
      process.on('exit', (code) => resolve(code))
      process.on('close', (code) => resolve(code))
      process.on('error', (error) => reject(error))
    })
  }

  uploadToS3(dest: string, bucket: string): Promise<number | null> {
    return new Promise<number | null>((resolve, reject) => {
      const date = new Date().toISOString()
      const host = `${bucket}.s3.amazonaws.com`
      const file = path.basename(dest)
      const contentType = 'application/x-compressed-tar'
      const acl = 'bucket-owner-full-control'

      const process = spawn(
        `curl`,
        [
          '-X',
          `PUT`,
          `-T`,
          `${dest}`,
          `-H`,
          `Host: ${host}`,
          `-H`,
          `Date: ${date}`,
          `-H`,
          `Content-Type: ${contentType}`,
          `-H`,
          `x-amz-acl: ${acl}`,
          `https://${host}/${file}`,
        ],
        { stdio: 'inherit' },
      )

      process.on('message', (m) => this.log(String(m)))
      process.on('exit', (code) => resolve(code))
      process.on('error', (error) => reject(error))
    })
  }
}
