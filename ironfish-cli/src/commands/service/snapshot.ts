/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert, AsyncUtils, FileUtils, GENESIS_BLOCK_SEQUENCE } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { spawn } from 'child_process'
import fsAsync from 'fs/promises'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { parseNumber } from '../../args'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class CreateSnapshot extends IronfishCommand {
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

    const exportDir = flags.path
      ? this.sdk.fileSystem.resolve(flags.path)
      : this.sdk.config.dataDir

    const exportPath = this.sdk.fileSystem.join(exportDir, 'data.json')

    const client = await this.sdk.connectRpc()

    const stream = client.snapshotChainStream({
      start: args.start as number | null,
      stop: args.stop as number | null,
    })

    const { start, stop } = await AsyncUtils.first(stream.contentStream())
    this.log(`Exporting chain from ${start} -> ${stop} to ${exportPath}`)

    const progress = CliUx.ux.progress({
      format: 'Exporting blocks: [{bar}] {value}/{total} {percentage}% | ETA: {eta}s',
    }) as ProgressBar

    progress.start(stop - start + 1, 0)

    const results: unknown[] = []

    for await (const result of stream.contentStream()) {
      results.push(result.block)
      progress.update(result.block?.seq || 0)
    }

    progress.stop()

    await this.sdk.fileSystem.mkdir(exportDir, { recursive: true })

    // await fs.promises.writeFile(exportPath, JSON.stringify(results, undefined, '  '))
    await fs.promises.writeFile(exportPath, JSON.stringify(results, (key, value) =>
            typeof value === 'bigint'
                ? value.toString()
                : value // return everything else unchanged
        , '  '));
    this.log('Export complete')
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
