/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { IronfishCommand } from '../../command'
import { launchEditor } from '../../utils'
import { ConfigFlag, ConfigFlagKey, DataDirFlag, DataDirFlagKey } from '../../flags'
import os from 'os'
import { mkdtemp, writeFile, readFile } from 'fs'
import path from 'path'
import { promisify } from 'util'
import { getConnectedClient } from './show'
import { DEFAULT_CONFIG_NAME, JSONUtils } from 'ironfish'
import { flags } from '@oclif/command'

const mkdtempAsync = promisify(mkdtemp)
const writeFileAsync = promisify(writeFile)
const readFileAsync = promisify(readFile)

export class EditCommand extends IronfishCommand {
  static description = `Edit the config in your configured editor

  Set the editor in either EDITOR environment variable, or set 'editor' in your ironfish config`

  static flags = {
    [ConfigFlagKey]: ConfigFlag,
    [DataDirFlagKey]: DataDirFlag,
    remote: flags.boolean({
      default: false,
      description: 'connect to the node when editing the config',
    }),
  }

  async start(): Promise<void> {
    const { flags } = this.parse(EditCommand)

    if (!flags.remote) {
      const configPath = this.sdk.config.storage.configPath
      this.log(`Editing ${configPath}`)
      const code = await launchEditor(configPath)
      this.exit(code || undefined)
    }

    const client = await getConnectedClient(this.sdk, !flags.remote)
    const response = await client.getConfig({ user: true })
    const output = JSON.stringify(response.content, undefined, '   ')

    const tmpDir = os.tmpdir()
    const folderPath = await mkdtempAsync(path.join(tmpDir, 'ironfish'))
    const filePath = path.join(folderPath, DEFAULT_CONFIG_NAME)

    await writeFileAsync(filePath, output)
    const code = await launchEditor(filePath)

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
