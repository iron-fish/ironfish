/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { NodeUtils, PromiseUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import fs from 'fs'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { ProgressBar } from '../types'
import { S3Utils, TarUtils } from '../utils'

const EXTENSION = '.tar.gz'

export default class Restore extends IronfishCommand {
  static hidden = true
  static description = 'Download and unzip a datadir from an S3 bucket'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    lock: Flags.boolean({
      default: true,
      allowNo: true,
      description: 'Wait for the database to stop being used',
    }),
  }

  static args = [
    {
      name: 'bucket',
      required: true,
      description: 'The S3 bucket to upload to',
    },
    {
      name: 'name',
      required: true,
      description: 'The name of the backup from the S3 bucket',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Restore)

    const bucket = (args.bucket as string).trim()
    let name = (args.name as string).trim()

    if (!name.endsWith(EXTENSION)) {
      name = name + EXTENSION
    }

    if (flags.lock) {
      const node = await this.sdk.node({ autoSeed: false })
      await NodeUtils.waitForOpen(node)
      await node.shutdown()
    }

    const workDir = path.join(os.tmpdir(), `ironfish.backup`)
    const downloadDir = path.join(workDir, bucket)
    const downloadTo = path.join(downloadDir, name)
    const unzipTo = path.join(downloadDir, path.basename(downloadTo, EXTENSION))
    const downloadFrom = S3Utils.getDownloadUrl(bucket, name, {
      accelerated: false,
      regionCode: 'us-east-1',
    })

    await fsAsync.rm(workDir, { recursive: true, force: true })
    await fsAsync.mkdir(downloadDir, { recursive: true })
    await fsAsync.mkdir(unzipTo, { recursive: true })

    this.log(`Downloading\n    SRC: ${downloadFrom}\n    DST:   ${downloadDir}`)

    const progress = CliUx.ux.progress({
      format: 'Downloading backup: [{bar}] {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(1)

    await downloadFileTo(downloadFrom, downloadTo, (percent: number) => {
      progress.update(percent)
    })

    progress.stop()

    this.log(`Unzipping\n    SRC ${downloadTo}\n    DST ${unzipTo}`)
    CliUx.ux.action.start(`Unzipping ${path.basename(downloadTo)}`)
    await TarUtils.unzipTar(downloadTo, unzipTo)
    CliUx.ux.action.stop('done\n')

    // We do this because the backup can be created with any datadir name
    // So anything could be inside of the zip file. We want it to match our
    // specified data dir though.
    CliUx.ux.action.start(`Getting backup name`)
    const backupName = (await fsAsync.readdir(unzipTo))[0]
    const unzipFrom = path.join(unzipTo, backupName)
    CliUx.ux.action.stop(`${backupName}\n`)

    this.log(`Moving\n    SRC ${unzipFrom}\n    DST ${this.sdk.config.dataDir}`)
    CliUx.ux.action.start(`Moving to ${this.sdk.config.dataDir}`)
    await fsAsync.rm(this.sdk.config.dataDir, { recursive: true, force: true })
    await fsAsync.rename(unzipFrom, this.sdk.config.dataDir)
    CliUx.ux.action.stop(`done\n`)
  }
}

async function downloadFileTo(
  from: string,
  to: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  const [promise, resolve, reject] = PromiseUtils.split<void>()

  const { data, headers } = (await axios({
    url: from,
    method: 'GET',
    responseType: 'stream',
  })) as { data: fs.ReadStream; headers: { 'content-length'?: number } }

  const writer = fs.createWriteStream(to)
  const total = headers['content-length'] || 1
  let current = 0

  data.on('data', (chunk) => {
    current += chunk.length
    onProgress(current / total)
  })

  data.on('error', (err) => reject(err))
  data.on('end', () => resolve())
  data.pipe(writer)

  return promise
}
