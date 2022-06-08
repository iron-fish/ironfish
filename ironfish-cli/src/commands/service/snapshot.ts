/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, AsyncUtils, FileUtils, GENESIS_BLOCK_SEQUENCE } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { spawn } from 'child_process'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class CreateSnapshot extends IronfishCommand {
  static hidden = true

  static description = `Upload chain snapshot to a public bucket`

  static flags = {
    ...RemoteFlags,
    bucket: Flags.string({
      char: 'e',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Bucket URL to upload snapshot to',
    }),
    path: Flags.string({
      char: 'e',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'a path to export the chain to',
    }),
  }

  static args = [
    {
      name: 'start',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      default: Number(GENESIS_BLOCK_SEQUENCE),
      required: false,
      description: 'the sequence to start snapshot at (inclusive, genesis block is 1)',
    },
    {
      name: 'stop',
      parse: (input: string): Promise<number | null> => Promise.resolve(parseNumber(input)),
      required: false,
      description: 'the sequence to snapshot end at (inclusive)',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(CreateSnapshot)

    const bucket = (flags.bucket || process.env.IRONFISH_SNAPSHOT_BUCKET || '').trim()
    if (!bucket) {
      this.log(
        `Cannot upload snapshot without bucket URL. You must set IRONFISH_SNAPSHOT_BUCKET or pass --bucket flag.`,
      )
      this.exit(1)
    }

    let exportDir

    if (flags.path) {
      exportDir = this.sdk.fileSystem.resolve(flags.path)
    } else {
      try {
        exportDir = await fsAsync.mkdtemp(`${os.tmpdir()}${path.sep}`)
      } catch (err) {
        this.log(`Could not create temp folder for snapshot generation`)
        this.exit(1)
      }
    }
    Assert.isNotUndefined(exportDir)

    const blockExportPath = this.sdk.fileSystem.join(exportDir, 'blocks')
    await this.sdk.fileSystem.mkdir(blockExportPath, { recursive: true })

    this.log('Connecting to node...')

    const client = await this.sdk.connectRpc()

    const response = client.snapshotChainStream({
      start: args.start as number | null,
      stop: args.stop as number | null,
    })

    const { start, stop } = await AsyncUtils.first(response.contentStream())
    this.log(`Retrieving blocks from ${start} -> ${stop} for snapshot generation`)

    const progress = CliUx.ux.progress({
      format: 'Retrieving blocks: [{bar}] {value}/{total} {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(stop - start + 1, 0)

    for await (const result of response.contentStream()) {
      if (result.buffer && result.seq) {
        const blockFilePath = this.sdk.fileSystem.join(blockExportPath, `${result.seq}.bin`)
        await fsAsync.writeFile(blockFilePath, Buffer.from(result.buffer))
        progress.update(result.seq || 0)
      }
    }

    progress.stop()

    const snapshotPath = this.sdk.fileSystem.join(
      exportDir,
      `ironfish_snapshot_${Date.now()}.tar.gz`,
    )

    this.log(`Zipping\n    SRC ${blockExportPath}\n    DST ${snapshotPath}\n`)
    CliUx.ux.action.start(`Zipping ${blockExportPath}`)
    await this.zipDir(blockExportPath, snapshotPath)

    const stat = await fsAsync.stat(snapshotPath)
    CliUx.ux.action.stop(`done (${FileUtils.formatFileSize(stat.size)})`)

    CliUx.ux.action.start(`Uploading to ${bucket}`)
    await this.uploadToS3(snapshotPath, bucket)
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
