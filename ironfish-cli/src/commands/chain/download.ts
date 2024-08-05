/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, FileUtils, NodeUtils } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import fsAsync from 'fs/promises'
import { IronfishCommand } from '../../command'
import { DownloadedSnapshot, getDefaultManifestUrl, SnapshotDownloader } from '../../snapshot'
import { confirmOrQuit, ProgressBar, ProgressBarPresets } from '../../ui'

export default class Download extends IronfishCommand {
  static description = 'download the blockchain quickly'

  static flags = {
    manifestUrl: Flags.string({
      char: 'm',
      description: 'Manifest url to download snapshot from',
    }),
    path: Flags.string({
      char: 'p',
      required: false,
      description: 'Path to a downloaded snapshot file to import',
    }),
    output: Flags.string({
      char: 'o',
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

      await confirmOrQuit(
        `Download ${fileSize} snapshot to update from block ${headSequence} to ${manifest.block_sequence}? ` +
          `\nAt least ${spaceRequired} of free disk space is required to download and unzip the snapshot file.` +
          `\nAre you sure?`,
        flags.confirm,
      )

      const snapshotUrl = await Downloader.snapshotURL()
      const snapshotPath = await Downloader.snapshotPath()
      this.log(`Downloading snapshot from ${snapshotUrl} to ${snapshotPath}`)

      const downloadBar = new ProgressBar('Downloading snapshot', {
        preset: ProgressBarPresets.withSpeed,
        formatFn: FileUtils.formatFileSize,
      })

      downloadBar.start(manifest.file_size, 0)

      await Downloader.download((prev, curr) => {
        downloadBar.update(curr)
      }).catch((error) => {
        downloadBar.stop()
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

    const unzipBar = new ProgressBar('Unzipping snapshot', {
      preset: ProgressBarPresets.withSpeed,
    })

    unzipBar.start(0, 0)

    await downloadedSnapshot.unzip(
      (totalEntries: number, prevExtracted: number, currExtracted: number) => {
        unzipBar.setTotal(totalEntries)
        unzipBar.update(currExtracted)
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
