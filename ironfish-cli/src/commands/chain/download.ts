/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, FileUtils, Meter, NodeUtils, TimeUtils } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { DownloadedSnapshot, getDefaultManifestUrl, SnapshotDownloader } from '../../snapshot'
import { ProgressBar } from '../../types'

export default class Download extends IronfishCommand {
  static hidden = false

  static description = `Download and import a chain snapshot`

  static flags = {
    ...LocalFlags,
    manifestUrl: Flags.string({
      char: 'm',
      parse: (input: string) => Promise.resolve(input.trim()),
      description: 'Manifest url to download snapshot from',
    }),
    path: Flags.string({
      char: 'p',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Path to a downloaded snapshot file to import',
    }),
    output: Flags.string({
      char: 'o',
      parse: (input: string) => Promise.resolve(input.trim()),
      required: false,
      description: 'Output folder to download the snapshot file to',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm download without asking',
    }),
    cleanup: Flags.boolean({
      default: true,
      description: 'Remove downloaded snapshot file after import',
      allowNo: true,
      hidden: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Download)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)
    const nodeChainDBVersion = await node.chain.blockchainDb.getVersion()
    const headSequence = node.chain.head.sequence
    await node.closeDB()

    let downloadedSnapshot: DownloadedSnapshot
    if (flags.path) {
      downloadedSnapshot = new DownloadedSnapshot(this.sdk, flags.path)
    } else {
      const networkId = this.sdk.internal.get('networkId')
      const manifestUrl = flags.manifestUrl ?? getDefaultManifestUrl(networkId)
      if (!manifestUrl) {
        this.log(`Manifest url for the snapshots are not available for network ID ${networkId}`)
        return this.exit(1)
      }

      let dest = flags.output
      if (!dest) {
        await fsAsync.mkdir(this.sdk.config.tempDir, { recursive: true })
        dest = this.sdk.config.tempDir
      }

      const Downloader = new SnapshotDownloader(manifestUrl, dest, nodeChainDBVersion)

      const manifest = await Downloader.manifest()

      const fileSize = FileUtils.formatFileSize(manifest.file_size)
      const spaceRequired = FileUtils.formatFileSize(manifest.file_size * 2)

      if (!flags.confirm) {
        const confirm = await ux.confirm(
          `Download ${fileSize} snapshot to update from block ${headSequence} to ${manifest.block_sequence}? ` +
            `\nAt least ${spaceRequired} of free disk space is required to download and unzip the snapshot file.` +
            `\nAre you sure? (Y)es / (N)o`,
        )

        if (!confirm) {
          this.exit(0)
        }
      }

      const snapshotUrl = await Downloader.snapshotURL()
      const snapshotPath = await Downloader.snapshotPath()
      this.log(`Downloading snapshot from ${snapshotUrl} to ${snapshotPath}`)

      const bar = ux.progress({
        barCompleteChar: '\u2588',
        barIncompleteChar: '\u2591',
        format:
          'Downloading snapshot: [{bar}] {percentage}% | {downloadedSize} / {fileSize} | {speed}/s | ETA: {estimate}',
      }) as ProgressBar

      bar.start(manifest.file_size, 0, {
        fileSize,
        downloadedSize: FileUtils.formatFileSize(0),
        speed: '0',
        estimate: TimeUtils.renderEstimate(0, 0, 0),
      })

      const speed = new Meter()
      speed.start()

      await Downloader.download((prev, curr) => {
        speed.add(curr - prev)

        bar.update(curr, {
          downloadedSize: FileUtils.formatFileSize(curr),
          speed: FileUtils.formatFileSize(speed.rate1s),
          estimate: TimeUtils.renderEstimate(curr, manifest.file_size, speed.rate1m),
        })
      }).catch((error) => {
        bar.stop()
        speed.stop()
        this.logger.error(ErrorUtils.renderError(error))

        this.exit(1)
      })

      const path = await Downloader.verifyChecksum({ cleanup: flags.cleanup })
      if (!path) {
        this.log('Snapshot checksum does not match.')
        return this.exit(0)
      }

      downloadedSnapshot = new DownloadedSnapshot(this.sdk, path)
    }

    const progressBar = ux.progress({
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      format:
        'Unzipping snapshot: [{bar}] {percentage}% | {value} / {total} entries | {speed}/s | ETA: {estimate}',
    }) as ProgressBar

    progressBar.start(0, 0, {
      speed: '0',
      estimate: TimeUtils.renderEstimate(0, 0, 0),
    })

    const speed = new Meter()
    speed.start()

    await downloadedSnapshot.unzip(
      (totalEntries: number, prevExtracted: number, currExtracted: number) => {
        progressBar.setTotal(totalEntries)
        speed.add(currExtracted - prevExtracted)
        progressBar.update(currExtracted, {
          speed: speed.rate1s.toFixed(2),
          estimate: TimeUtils.renderEstimate(currExtracted, totalEntries, speed.rate1m),
        })
      },
    )

    ux.action.start(
      `Replacing existing chain data at ${downloadedSnapshot.chainDatabasePath} before importing snapshot`,
    )

    await downloadedSnapshot.replaceDatabase()

    ux.action.stop('done')

    if (flags.cleanup) {
      ux.action.start(`Cleaning up snapshot file at ${downloadedSnapshot.file}`)
      await fsAsync.rm(downloadedSnapshot.file)
      ux.action.stop('done')
    }
  }
}
