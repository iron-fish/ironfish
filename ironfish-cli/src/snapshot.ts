/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ErrorUtils, IronfishSdk, TimeUtils } from '@ironfish/sdk'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import fsAsync from 'fs/promises'
import { IncomingMessage } from 'http'
import path from 'path'
import tar from 'tar'

export type SnapshotManifest = {
  block_sequence: number
  checksum: string
  file_name: string
  file_size: number
  timestamp: number
  database_version: number
}

export const DEFAULT_MAINNET_MANIFEST_URL = `https://snapshots.ironfish.network/manifest.json`
export const DEFAULT_TESTNET_MANIFEST_URL = `https://testnet.snapshots.ironfish.network/manifest.json`

export const getDefaultManifestUrl = (networkId: number): string | null => {
  switch (networkId) {
    case 0:
      return DEFAULT_TESTNET_MANIFEST_URL
    case 1:
      return DEFAULT_MAINNET_MANIFEST_URL
    default:
      return null
  }
}

const tryParseUrl = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch (_) {
    return null
  }
}

const getSnapshotUrl = (manifestUrl: string, manifest: SnapshotManifest): string => {
  const snapshotUrl = tryParseUrl(manifest.file_name)?.toString()
  if (snapshotUrl) {
    return snapshotUrl
  }

  // Snapshot URL is not absolute so use a relative URL from the manifest
  const url = new URL(manifestUrl)
  const parts = url.pathname.split('/').filter((s) => !!s.trim())
  parts.pop()
  parts.push(manifest.file_name)
  url.pathname = parts.join('/')
  return url.toString()
}

async function matchesChecksum(file: string, checksum: string): Promise<boolean> {
  const hasher = crypto.createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(file)
    stream.on('end', resolve)
    stream.on('error', reject)
    stream.pipe(hasher, { end: false })
  })

  const fileCheckSum = hasher.digest().toString('hex')
  return fileCheckSum === checksum
}

export class SnapshotDownloader {
  nodeChainDBVersion: number
  manifestUrl: string
  dest: string
  _manifest?: SnapshotManifest

  constructor(manifestUrl: string, dest: string, nodeChainDBVersion: number) {
    this.nodeChainDBVersion = nodeChainDBVersion
    this.manifestUrl = manifestUrl
    this.dest = dest
  }

  async manifest(): Promise<SnapshotManifest> {
    if (this._manifest) {
      return this._manifest
    }
    const manifest = (await axios.get<SnapshotManifest>(this.manifestUrl)).data
    this._manifest = manifest
    return manifest
  }

  async snapshotURL(): Promise<string> {
    const manifest = await this.manifest()
    return getSnapshotUrl(this.manifestUrl, manifest)
  }

  async snapshotPath(): Promise<string> {
    const manifest = await this.manifest()
    return path.join(this.dest, manifest.file_name)
  }

  async download(onDownloadProgress: (prev: number, curr: number) => void): Promise<void> {
    const manifest = await this.manifest()
    const snapshotPath = await this.snapshotPath()

    if (manifest.database_version > this.nodeChainDBVersion) {
      throw new Error(
        `This snapshot is from a later database version (${manifest.database_version}) than your node (${this.nodeChainDBVersion}). Aborting import.`,
      )
    }

    let downloaded = 0

    const statResult = await fsAsync.stat(snapshotPath).catch(() => null)
    if (statResult?.isFile()) {
      downloaded = statResult.size
    }

    if (downloaded >= manifest.file_size) {
      return
    }

    const idleTimeout = 30000
    let idleLastChunk = performance.now()
    const idleCancelSource = axios.CancelToken.source()

    const idleInterval = setInterval(() => {
      const timeSinceLastChunk = performance.now() - idleLastChunk

      if (timeSinceLastChunk > idleTimeout) {
        clearInterval(idleInterval)

        idleCancelSource.cancel(
          `Download timed out after ${TimeUtils.renderSpan(timeSinceLastChunk)}`,
        )
      }
    }, idleTimeout)

    const snapshotUrl = await this.snapshotURL()

    const response: { data: IncomingMessage } = await axios({
      method: 'GET',
      responseType: 'stream',
      url: snapshotUrl,
      cancelToken: idleCancelSource.token,
      headers: {
        range: `bytes=${downloaded}-`,
      },
    })

    const resumingDownload = response.data.statusCode === 206
    const writer = fs.createWriteStream(snapshotPath, {
      flags: resumingDownload ? 'a' : 'w',
    })

    downloaded = resumingDownload ? downloaded : 0

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

        onDownloadProgress(downloaded, downloaded + chunk.length)
        downloaded += chunk.length
        idleLastChunk = performance.now()
      })
    })
      .catch((error) => {
        if (idleCancelSource.token.reason?.message) {
          throw new Error(idleCancelSource.token.reason?.message)
        } else {
          throw new Error(
            `Error while downloading snapshot file: ${ErrorUtils.renderError(error)}`,
          )
        }
      })
      .finally(() => {
        clearInterval(idleInterval)
      })
  }

  async verifyChecksum(options: { cleanup: boolean }): Promise<string | null> {
    const manifest = await this.manifest()

    const destination = path.join(this.dest, manifest.file_name)

    const matches = await matchesChecksum(destination, manifest.checksum)
    if (!matches) {
      if (options.cleanup) {
        await fsAsync.rm(destination, { recursive: true, force: true })
      }
      return null
    }

    return destination
  }
}

export class DownloadedSnapshot {
  private sdk: IronfishSdk
  readonly file: string

  constructor(sdk: IronfishSdk, file: string) {
    this.sdk = sdk
    this.file = file
  }

  get chainDatabasePath(): string {
    return this.sdk.fileSystem.resolve(this.sdk.config.chainDatabasePath)
  }

  get snapshotDatabasePath(): string {
    return this.sdk.fileSystem.join(this.sdk.config.tempDir, 'snapshot')
  }

  async unzip(
    onEntry: (totalEntries: number, prevExtracted: number, currExtracted: number) => void,
  ): Promise<void> {
    await fsAsync.mkdir(this.snapshotDatabasePath, { recursive: true })

    let totalEntries = 0
    let extracted = 0

    tar.list({
      file: this.file,
      onentry: (_) => onEntry(++totalEntries, extracted, extracted),
    })

    await tar.extract({
      file: this.file,
      C: this.snapshotDatabasePath,
      strip: 1,
      strict: true,
      onentry: (_) => onEntry(totalEntries, extracted, ++extracted),
    })
  }

  async replaceDatabase(): Promise<void> {
    await fsAsync.rm(this.chainDatabasePath, { recursive: true, force: true, maxRetries: 10 })
    await fsAsync.rename(this.snapshotDatabasePath, this.chainDatabasePath)
  }
}
