/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  ErrorUtils,
  FileUtils,
  Meter,
  NodeUtils,
  TimeUtils,
  VERSION_DATABASE_CHAIN,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import { IncomingMessage } from 'http'
import path from 'path'
import * as stream from 'stream'
import tar from 'tar'
import { promisify } from 'util'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { DEFAULT_SNAPSHOT_BUCKET, SnapshotManifest } from '../../snapshot'
import { ProgressBar } from '../../types'

export default class Download extends IronfishCommand {
  static hidden = false

  static description = `Download and import a chain snapshot`

  static flags = {
    ...LocalFlags,
    bucketUrl: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Bucket URL to download snapshot from',
    }),
    path: Flags.string({
      char: 'p',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Path to snapshot file',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Download)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    let snapshotPath
    const tempDir = this.sdk.fileSystem.resolve(this.sdk.config.tempDir)
    await fsAsync.mkdir(tempDir, { recursive: true })

    if (flags.path) {
      snapshotPath = this.sdk.fileSystem.resolve(flags.path)
    } else {
      const bucketUrl = (
        flags.bucketUrl || `https://${DEFAULT_SNAPSHOT_BUCKET}.s3-accelerate.amazonaws.com`
      ).trim()
      if (!bucketUrl) {
        this.log(`Cannot download snapshot without bucket URL`)
        this.exit(1)
      }

      const manifest = (await axios.get<SnapshotManifest>(`${bucketUrl}/manifest.json`)).data

      if (manifest.database_version > VERSION_DATABASE_CHAIN) {
        this.log(
          `This snapshot is from a later database version (${manifest.database_version}) than your node (${VERSION_DATABASE_CHAIN}). Aborting import.`,
        )
        this.exit(1)
      }

      const fileSize = FileUtils.formatFileSize(manifest.file_size)

      if (!flags.confirm) {
        const confirm = await CliUx.ux.confirm(
          `Download ${fileSize} snapshot to update chain head from block ${node.chain.head.sequence} to ${manifest.block_sequence}?`,
        )

        if (!confirm) {
          this.log('Snapshot download aborted.')
          this.exit(0)
        }
      }

      snapshotPath = path.join(tempDir, manifest.file_name)
      const snapshotFile = await fsAsync.open(snapshotPath, 'w')
      const bar = CliUx.ux.progress({
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        format:
          'Downloading snapshot: [{bar}] {percentage}% | {downloadedSize} / {fileSize} | {speed}/s | ETA: {estimate}',
      }) as ProgressBar
      const speed = new Meter()

      bar.start(manifest.file_size, 0, { fileSize })
      speed.start()
      let downloaded = 0

      const hasher = crypto.createHash('sha256')
      const writer = snapshotFile.createWriteStream()
      const finished = promisify(stream.finished)

      await axios({
        method: 'GET',
        responseType: 'stream',
        url: `${bucketUrl}/${manifest.file_name}`,
      })
        .then(async (response: { data: IncomingMessage }) => {
          response.data.on('data', (chunk: { length: number }) => {
            downloaded += chunk.length
            speed.add(chunk.length)
            bar.update(downloaded, {
              downloadedSize: FileUtils.formatFileSize(downloaded),
              speed: FileUtils.formatFileSize(speed.rate1s),
              estimate: TimeUtils.renderEstimate(downloaded, manifest.file_size, speed.rate1m),
            })
          })
          response.data.pipe(writer)
          response.data.pipe(hasher)
          await finished(writer)
          bar.stop()
          speed.stop()
        })
        .catch((error: unknown) => {
          bar.stop()
          speed.stop()
          this.logger.error(
            `Error while downloading snapshot file: ${ErrorUtils.renderError(error)}`,
          )
          this.exit(1)
        })

      const checksum = hasher.digest().toString('hex')
      if (checksum !== manifest.checksum) {
        this.log('Snapshot checksum does not match.')
        this.exit(0)
      }
    }

    // use a standard name, 'snapshot', for the unzipped database
    const snapshotDatabasePath = this.sdk.fileSystem.join(tempDir, 'snapshot')
    await this.sdk.fileSystem.mkdir(snapshotDatabasePath, { recursive: true })

    CliUx.ux.action.start(`Unzipping ${snapshotPath}`)
    await this.unzip(snapshotPath, snapshotDatabasePath)
    CliUx.ux.action.stop('...done')

    const chainDatabasePath = this.sdk.fileSystem.resolve(this.sdk.config.chainDatabasePath)

    CliUx.ux.action.start(
      `Moving snapshot from ${snapshotDatabasePath} to ${chainDatabasePath}`,
    )
    if (await this.sdk.fileSystem.exists(chainDatabasePath)) {
      // chainDatabasePath must be empty before renaming snapshot
      await fsAsync.rm(chainDatabasePath, { recursive: true })
    }
    await fsAsync.rename(snapshotDatabasePath, chainDatabasePath)
    CliUx.ux.action.stop('...done')
  }

  async unzip(source: string, dest: string): Promise<void> {
    await tar.extract({
      file: source,
      C: dest,
      strip: 1,
    })
  }
}
