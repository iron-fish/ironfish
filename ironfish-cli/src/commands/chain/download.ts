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
import fs from 'fs'
import fsAsync from 'fs/promises'
import { IncomingMessage } from 'http'
import path from 'path'
import tar from 'tar'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { SnapshotManifest } from '../../snapshot'
import { ProgressBar } from '../../types'
import { UrlUtils } from '../../utils/url'

export default class Download extends IronfishCommand {
  static hidden = false

  static description = `Download and import a chain snapshot`

  static flags = {
    ...LocalFlags,
    manifestUrl: Flags.string({
      char: 'm',
      parse: (input: string) => Promise.resolve(input.trim()),
      description: 'Manifest url to download snapshot from',
      default: 'https://d1kj1bottktsu0.cloudfront.net/manifest.json',
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
    await fsAsync.mkdir(this.sdk.config.tempDir, { recursive: true })

    if (flags.path) {
      snapshotPath = this.sdk.fileSystem.resolve(flags.path)
    } else {
      if (!flags.manifestUrl) {
        this.log(`Cannot download snapshot without manifest URL`)
        this.exit(1)
      }

      const manifest = (await axios.get<SnapshotManifest>(flags.manifestUrl)).data

      if (manifest.database_version > VERSION_DATABASE_CHAIN) {
        this.log(
          `This snapshot is from a later database version (${manifest.database_version}) than your node (${VERSION_DATABASE_CHAIN}). Aborting import.`,
        )
        this.exit(1)
      }

      const fileSize = FileUtils.formatFileSize(manifest.file_size)

      if (!flags.confirm) {
        const confirm = await CliUx.ux.confirm(
          `Download ${fileSize} snapshot to update from block ${node.chain.head.sequence} to ${manifest.block_sequence}?` +
            `\nAre you sure? (Y)es / (N)o`,
        )

        if (!confirm) {
          this.exit(0)
        }
      }

      let snapshotUrl = UrlUtils.tryParseUrl(manifest.file_name)?.toString()

      if (!snapshotUrl) {
        // Snapshot URL is not absolute so use a relative URL from the manifest
        const url = new URL(flags.manifestUrl)
        const parts = UrlUtils.splitPathName(url.pathname)
        parts.pop()
        parts.push(manifest.file_name)
        url.pathname = UrlUtils.joinPathName(parts)
        snapshotUrl = url.toString()
      }

      this.log(`Downloading snapshot from ${snapshotUrl}`)

      snapshotPath = path.join(this.sdk.config.tempDir, manifest.file_name)

      const bar = CliUx.ux.progress({
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        format:
          'Downloading snapshot: [{bar}] {percentage}% | {downloadedSize} / {fileSize} | {speed}/s | ETA: {estimate}',
      }) as ProgressBar

      bar.start(manifest.file_size, 0, {
        fileSize,
        downloadedSize: '0',
        speed: '0',
        estimate: TimeUtils.renderEstimate(0, 0, 0),
      })

      const speed = new Meter()
      speed.start()

      let downloaded = 0

      const hasher = crypto.createHash('sha256')
      const writer = fs.createWriteStream(snapshotPath, { flags: 'w' })

      const idleTimeout = 30000
      let idleLastChunk = Date.now()
      const idleCancelSource = axios.CancelToken.source()

      const idleInterval = setInterval(() => {
        const timeSinceLastChunk = Date.now() - idleLastChunk

        if (timeSinceLastChunk > idleTimeout) {
          clearInterval(idleInterval)

          idleCancelSource.cancel(
            `Download timed out after ${TimeUtils.renderSpan(timeSinceLastChunk)}`,
          )
        }
      }, idleTimeout)

      const response: { data: IncomingMessage } = await axios({
        method: 'GET',
        responseType: 'stream',
        url: snapshotUrl,
        cancelToken: idleCancelSource.token,
      })

      await new Promise<void>((resolve, reject) => {
        const onWriterError = (e: unknown) => {
          writer.removeListener('close', onWriterClose)
          writer.removeListener('error', onWriterError)
          reject(e)
        }

        const onWriterClose = () => {
          writer.removeListener('close', onWriterClose)
          writer.removeListener('error', onWriterError)
          resolve()
        }

        writer.on('error', onWriterError)
        writer.on('close', onWriterClose)

        response.data.on('error', (e) => {
          writer.destroy(e)
        })

        response.data.on('end', () => {
          writer.close()
        })

        response.data.on('data', (chunk: Buffer) => {
          writer.write(chunk)
          hasher.write(chunk)

          downloaded += chunk.length
          speed.add(chunk.length)
          idleLastChunk = Date.now()

          bar.update(downloaded, {
            downloadedSize: FileUtils.formatFileSize(downloaded),
            speed: FileUtils.formatFileSize(speed.rate1s),
            estimate: TimeUtils.renderEstimate(downloaded, manifest.file_size, speed.rate1m),
          })
        })
      })
        .catch((error) => {
          bar.stop()
          speed.stop()

          if (idleCancelSource.token.reason?.message) {
            this.logger.error(idleCancelSource.token.reason?.message)
          } else {
            this.logger.error(
              `Error while downloading snapshot file: ${ErrorUtils.renderError(error)}`,
            )
          }

          this.exit(1)
        })
        .finally(() => {
          clearInterval(idleInterval)
        })

      bar.stop()
      speed.stop()

      const checksum = hasher.digest().toString('hex')
      if (checksum !== manifest.checksum) {
        this.log('Snapshot checksum does not match.')
        this.exit(0)
      }
    }

    // use a standard name, 'snapshot', for the unzipped database
    const snapshotDatabasePath = this.sdk.fileSystem.join(this.sdk.config.tempDir, 'snapshot')
    await this.sdk.fileSystem.mkdir(snapshotDatabasePath, { recursive: true })

    CliUx.ux.action.start(`Unzipping ${snapshotPath}`)
    await this.unzip(snapshotPath, snapshotDatabasePath)
    CliUx.ux.action.stop('done')

    const chainDatabasePath = this.sdk.fileSystem.resolve(this.sdk.config.chainDatabasePath)

    CliUx.ux.action.start(
      `Moving snapshot from ${snapshotDatabasePath} to ${chainDatabasePath}`,
    )
    if (await this.sdk.fileSystem.exists(chainDatabasePath)) {
      // chainDatabasePath must be empty before renaming snapshot
      await fsAsync.rm(chainDatabasePath, { recursive: true })
    }
    await fsAsync.rename(snapshotDatabasePath, chainDatabasePath)
    CliUx.ux.action.stop('done')
  }

  async unzip(source: string, dest: string): Promise<void> {
    await tar.extract({
      file: source,
      C: dest,
      strip: 1,
    })
  }
}
