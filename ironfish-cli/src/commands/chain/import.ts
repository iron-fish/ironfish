/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_SNAPSHOT_BUCKET, FileUtils } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import axios from 'axios'
import { spawn } from 'child_process'
import crypto from 'crypto'
import fsAsync from 'fs/promises'
import os from 'os'
import path from 'path'
import { v4 as uuid } from 'uuid'
import { IronfishCommand } from '../../command'
import { RemoteFlags } from '../../flags'
import { ProgressBar } from '../../types'

export default class ImportSnapshot extends IronfishCommand {
  static hidden = false

  static description = `Import chain snapshot`

  static flags = {
    ...RemoteFlags,
    bucket: Flags.string({
      char: 'b',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Bucket URL to download snapshot from',
    }),
    path: Flags.string({
      char: 'p',
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

    let snapshotPath
    const tempDir = path.join(os.tmpdir(), uuid())
    await fsAsync.mkdir(tempDir, { recursive: true })

    if (flags.path) {
      snapshotPath = flags.path
    } else {
      const bucket = (flags.bucket || DEFAULT_SNAPSHOT_BUCKET || '').trim()
      if (!bucket) {
        this.log(`Cannot download snapshot without bucket URL`)
      }

      const manifest = await axios
        .get<{
          checksum: string
          file_name: string
          file_size: number
          timestamp: number
          block_height: number
        }>(`${bucket}/manifest.json`)
        .then((r) => r.data)

      if (!flags.confirm) {
        this.log(
          `This snapshot (${
            manifest.file_name
          }) contains the Iron Fish blockchain up to block ${
            manifest.block_height
          }. The size of the latest snapshot file is ${FileUtils.formatFileSize(
            manifest.file_size,
          )}`,
        )

        const confirm = await CliUx.ux.confirm('Do you wish to continue (Y/N)?')
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
        format: 'Downloading snapshot: [{bar}] {value}% | ETA: {eta}s',
      }) as ProgressBar

      bar.start()

      const hasher = crypto.createHash('sha256')
      const writer = snapshotFile.createWriteStream()

      await axios({
        method: 'GET',
        responseType: 'stream',
        url: `${bucket}/${manifest.file_name}`,
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
      if (checksum !== manifest.checksum) {
        this.log('Snapshot checksum does not match.')
        this.exit(0)
      }
    }

    CliUx.ux.action.start(`Unzipping ${snapshotPath}`)
    await this.unzip(snapshotPath, tempDir)
    CliUx.ux.action.stop('...done')
    const blockExportPath = this.sdk.fileSystem.join(tempDir, 'blocks')

    const files = await fsAsync.readdir(blockExportPath)
    files.sort((a, b) => Number(a) - Number(b))

    const client = await this.sdk.connectRpc()
    const status = await client.getChainInfo()
    let headSeq = Number(status.content.currentBlockIdentifier.index)

    for (const file of files) {
      if (headSeq > Number(file)) {
        continue
      }

      const blocks = await fsAsync.readFile(path.join(blockExportPath, file))
      const response = await client.importSnapshot({ blocks })
      headSeq = response.content.headSeq
    }
  }

  async unzip(source: string, dest: string, excludes: string[] = []): Promise<number | null> {
    return new Promise<number | null>((resolve, reject) => {
      const args = ['-xvzf', source, '-C', dest]

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
}
