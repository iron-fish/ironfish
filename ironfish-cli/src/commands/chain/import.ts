/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_SNAPSHOT_BUCKET, FileUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class ImportSnapshot extends IronfishCommand {
  static hidden = false

  static description = `Import chain snapshot`

  static flags = {
    ...RemoteFlags,
    bucket: Flags.string({
      char: 'e',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Bucket URL to download snapshot from',
    }),
    path: Flags.string({
      char: 'e',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Path to snapshot file',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(ImportSnapshot)

    const bucket = (flags.bucket || DEFAULT_SNAPSHOT_BUCKET || '').trim()
    if (!bucket) {
      this.log(`Cannot download snapshot without bucket URL`)
    }

    const manifest = await axios.get<{
      checksum: string
      file_name: string
      file_size: number
      timestamp: number
      block_height: number
    }>(`${DEFAULT_SNAPSHOT_BUCKET}/manifest.json`)

    if (!flags.confirm) {
      this.log(
        `This snapshot (${
          manifest.data.file_name
        }) contains the Iron Fish blockchain up to block ${
          manifest.data.block_height
        }. The size of the latest snapshot file is ${FileUtils.formatFileSize(
          manifest.data.file_size,
        )}`,
      )

      const confirm = await CliUx.ux.confirm('Do you wish to continue (Y/N)?')
      if (!confirm) {
        this.log('Snapshot download aborted.')
        this.exit(0)
      }
    }

    const bar = CliUx.ux.progress({
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format: 'Downloading snapshot: [{bar}] {value}% | ETA: {eta}s',
    }) as ProgressBar

    bar.start()

    const tempDir = await fsAsync.mkdtemp(`${os.tmpdir()}${path.sep}`)
    const snapshotPath = await fsAsync.open(path.join(tempDir, manifest.data.file_name), 'w')
    const hasher = crypto.createHash('sha256')
    const writer = snapshotPath.createWriteStream()

    await axios({
      method: 'GET',
      responseType: 'stream',
      url: `${DEFAULT_SNAPSHOT_BUCKET}/${manifest.data.file_name}`,
      onDownloadProgress: (progressEvent: {
        lengthComputable: number
        loaded: number
        total: number
      }) => {
        const percentage = Math.floor((progressEvent.loaded / progressEvent.total) * 100)
        bar.update(percentage)
      },
    }).then((response) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      response.data.pipe(writer)
      hasher.update(response.data)
    })

    const checksum = hasher.digest().toString('hex')
    if (checksum !== manifest.data.checksum) {
      this.log('Snapshot checksum does not match.')
      this.exit(0)
    }

    // TODO: Make final choice as to how snapshot is structured

    // TODO: If we just zip the database folder, we can de-compress to
    // the temp dir, rename the old folder, and copy the new folder over.
  }
}
