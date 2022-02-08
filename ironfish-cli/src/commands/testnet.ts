/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { flags } from '@oclif/command'
import { CliUx } from '@oclif/core'
import { WebApi } from 'ironfish'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'

export default class Testnet extends IronfishCommand {
  static hidden = false
  static description = 'Set up your node to mine for the testnet'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    confirm: flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
    skipName: flags.boolean({
      default: false,
      description: "Don't update your node name",
    }),
    skipGraffiti: flags.boolean({
      default: false,
      description: "Don't update your graffiti",
    }),
  }

  static args = [
    {
      name: 'user',
      required: false,
      description:
        'the user id or url to a testnet user like https://testnet.ironfish.network/users/1080',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = this.parse(Testnet)
    let userArg = ((args.user as string | undefined) || '').trim()

    if (!userArg) {
      userArg = (await CliUx.ux.prompt(
        'Enter the user id or url to a testnet user like https://testnet.ironfish.network/users/1080\nUser ID or URL',
        {
          required: true,
        },
      )) as string
      this.log('')
    }

    let userId: number | null = null

    const index = userArg.indexOf('users/')
    if (index !== -1) {
      userArg = userArg.slice(index + 'users/'.length)
    }

    if (!isNaN(Number(userArg))) {
      userId = Number(userArg)
    }

    if (userId === null) {
      this.log(`Could not figure out testnet user id from ${userArg}`)
      this.exit(1)
    }

    // request user from API
    this.log(`Asking Iron Fish who user ${userId} is...`)

    const api = new WebApi()
    const user = await api.getUser(userId)

    if (!user) {
      this.log(`Could not find a user with id ${userId}`)
      this.exit(1)
    }

    this.log('')
    this.log(`Hello ${user.graffiti}!`)
    this.log('')

    // Connect to node
    const node = await this.sdk.connectRpc()

    // Ask user for confirmation and explain changes
    const existingNodeName = (await node.getConfig({ name: 'nodeName' })).content.nodeName
    const existingGraffiti = (await node.getConfig({ name: 'blockGraffiti' })).content
      .blockGraffiti

    const updateNodeName = existingNodeName !== user.graffiti && !flags.skipName
    const updateGraffiti = existingGraffiti !== user.graffiti && !flags.skipGraffiti
    const needsUpdate = updateNodeName || updateGraffiti

    if (!needsUpdate) {
      this.log('Your node is already up to date!')
      this.exit(0)
    }

    if (!flags.confirm) {
      if (updateNodeName) {
        this.log(
          `You are about to change your NODE NAME from ${existingNodeName || '{NOT SET}'} to ${
            user.graffiti
          }`,
        )
      }

      if (updateGraffiti) {
        this.log(
          `You are about to change your GRAFFITI from ${existingGraffiti || '{NOT SET}'} to ${
            user.graffiti
          }`,
        )
      }

      const confirmed = flags.confirm || (await CliUx.ux.confirm(`Are you SURE? (y)es / (n)o`))
      if (!confirmed) {
        return
      }

      this.log('')
    }

    if (updateNodeName) {
      await node.setConfig({ name: 'nodeName', value: user.graffiti })
      this.log(
        `✅ Updated NODE NAME from ${existingNodeName || '{NOT SET}'} to ${user.graffiti}`,
      )
    }

    if (updateGraffiti) {
      await node.setConfig({ name: 'blockGraffiti', value: user.graffiti })
      this.log(
        `✅ Updated GRAFFITI from ${existingGraffiti || '{NOT SET}'} to ${user.graffiti}`,
      )
    }
  }
}
