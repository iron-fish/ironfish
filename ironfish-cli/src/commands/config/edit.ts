/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { DEFAULT_CONFIG_NAME, JSONUtils } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { mkdtemp, readFile, writeFile } from 'fs'
import os from 'os'
import path from 'path'
import { promisify } from 'util'
import { IronfishCommand } from '../../command'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../../flags'
import { launchEditor } from '../../utils'

const mkdtempAsync = promisify(mkdtemp)
const writeFileAsync = promisify(writeFile)
const readFileAsync = promisify(readFile)

export class EditCommand extends IronfishCommand {
  static description = `Edit the config in your configured editor

  Set the editor in either EDITOR environment variable, or set 'editor' in your ironfish config`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    remote: Flags.boolean({
      default: false,
      description: 'connect to the node when editing the config',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EditCommand)

    if (!flags.remote) {
      const configPath = this.sdk.config.storage.configPath
      this.log(`Editing ${configPath}`)
      const code = await launchEditor(configPath, this.sdk.config)
      this.exit(code || undefined)
    }

    const client = await this.sdk.connectRpc(!flags.remote)
    const response = await client.getConfig({ user: true })
    const output = JSON.stringify(response.content, undefined, '   ')

    const tmpDir = os.tmpdir()
    const folderPath = await mkdtempAsync(path.join(tmpDir, '@ironfish/sdk'))
    const filePath = path.join(folderPath, DEFAULT_CONFIG_NAME)

    await writeFileAsync(filePath, output)
    const code = await launchEditor(filePath, this.sdk.config)

    if (code !== 0) {
      this.exit(code || undefined)
    }

    const content = await readFileAsync(filePath, { encoding: 'utf8' })
    const config = JSONUtils.parse<Record<string, unknown>>(content)

    await client.uploadConfig({ config })
    this.log('Uploaded config successfully.')
    this.exit(0)
  }
}
