/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { WebApi } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { IronfishCommand } from '../command'
import { DataDirFlag, DataDirFlagKey, VerboseFlag, VerboseFlagKey } from '../flags'
import { ENABLE_TELEMETRY_CONFIG_KEY } from './start'

export default class Testnet extends IronfishCommand {
  static hidden = false
  static description = 'Set up your node to mine for the testnet'

  static flags = {
    [VerboseFlagKey]: VerboseFlag,
    [DataDirFlagKey]: DataDirFlag,
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
    skipName: Flags.boolean({
      default: false,
      description: "Don't update your node name",
    }),
    skipGraffiti: Flags.boolean({
      default: false,
      description: "Don't update your graffiti",
    }),
    skipTelemetry: Flags.boolean({
      default: false,
      description: "Don't update your telemetry",
    }),
  }

  static args = [
    {
      name: 'user',
      required: false,
      description:
        'the user graffiti or url to a testnet user like https://testnet.ironfish.network/users/1080',
    },
  ]

  async start(): Promise<void> {
    const { flags, args } = await this.parse(Testnet)

    const api = new WebApi()

    let userArg = ((args.user as string | undefined) || '').trim()

    if (!userArg) {
      userArg = (await CliUx.ux.prompt(
        'Enter the user graffiti or url to a testnet user like https://testnet.ironfish.network/users/1080\nUser Graffiti or URL',
        {
          required: true,
        },
      )) as string
      this.log('')
    }

    let confirmedGraffiti: string | null = null

    const containsUrl = userArg.indexOf('ironfish.network') !== -1
    if (containsUrl) {
      // Fetch by ID
      const index = userArg.indexOf('users/')
      if (index !== -1) {
        userArg = userArg.slice(index + 'users/'.length)
      }

      let userId: number | null = null
      if (!isNaN(Number(userArg))) {
        userId = Number(userArg)
      }

      if (userId === null) {
        this.log(`Could not figure out testnet user id from ${userArg}`)
        return this.exit(1)
      }

      // request user from API
      this.log(`Asking Iron Fish who user ${userId} is...`)

      const user = await api.getUser(userId)

      if (!user) {
        this.log(`Could not find a user with id ${userId}`)
        return this.exit(1)
      }

      confirmedGraffiti = user.graffiti
    } else {
      // Fetch by graffiti
      if (!userArg || userArg.length === 0) {
        this.log(`Could not figure out testnet user, graffiti was not provided`)
        return this.exit(1)
      }

      // request user from API
      this.log(`Asking Iron Fish to confirm user graffiti ${userArg}...`)

      const user = await api.findUser({ graffiti: userArg })

      if (!user) {
        this.log(`Could not find a user with graffiti ${userArg}`)
        return this.exit(1)
      }

      confirmedGraffiti = user.graffiti
    }

    this.log('')
    this.log(`Hello ${confirmedGraffiti}!`)
    this.log('')

    // Connect to node
    const node = await this.sdk.connectRpc()

    // Ask user for confirmation and explain changes
    const existingNodeName = (await node.getConfig({ name: 'nodeName' })).content.nodeName
    const existingGraffiti = (await node.getConfig({ name: 'blockGraffiti' })).content
      .blockGraffiti
    const telemetryEnabled = (await node.getConfig({ name: ENABLE_TELEMETRY_CONFIG_KEY }))
      .content.enableTelemetry

    const updateNodeName = existingNodeName !== confirmedGraffiti && !flags.skipName
    const updateGraffiti = existingGraffiti !== confirmedGraffiti && !flags.skipGraffiti
    const updateTelemetry = !telemetryEnabled && !flags.skipTelemetry

    const needsUpdate = updateNodeName || updateGraffiti || updateTelemetry

    if (!needsUpdate) {
      this.log('Your node is already up to date!')
      this.exit(0)
    }

    if (!flags.confirm) {
      if (updateTelemetry) {
        this.log(
          `You are about to enable telemetry which will submit anonymized data to Iron Fish`,
        )
      }

      if (updateNodeName) {
        this.log(
          `You are about to change your NODE NAME from ${
            existingNodeName || '{NOT SET}'
          } to ${confirmedGraffiti}`,
        )
      }

      if (updateGraffiti) {
        this.log(
          `You are about to change your GRAFFITI from ${
            existingGraffiti || '{NOT SET}'
          } to ${confirmedGraffiti}`,
        )
      }

      const confirmed = flags.confirm || (await CliUx.ux.confirm(`Are you SURE? (y)es / (n)o`))
      if (!confirmed) {
        return
      }

      this.log('')
    }

    if (updateNodeName) {
      await node.setConfig({ name: 'nodeName', value: confirmedGraffiti })
      this.log(
        `✅ Updated NODE NAME from ${existingNodeName || '{NOT SET}'} to ${confirmedGraffiti}`,
      )
    }

    if (updateGraffiti) {
      await node.setConfig({ name: 'blockGraffiti', value: confirmedGraffiti })
      this.log(
        `✅ Updated GRAFFITI from ${existingGraffiti || '{NOT SET}'} to ${confirmedGraffiti}`,
      )
    }

    if (updateTelemetry) {
      await node.setConfig({ name: ENABLE_TELEMETRY_CONFIG_KEY, value: true })
      this.log('✅ Telemetry Enabled 🙏')
    }
  }
}
