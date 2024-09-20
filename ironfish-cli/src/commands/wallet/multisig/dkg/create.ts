/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { RpcClient } from '@ironfish/sdk'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import * as ui from '../../../../ui'

export class DkgCreateCommand extends IronfishCommand {
  static description = 'Interactive command to create a multisignature account using DKG'

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    await this.parse(DkgCreateCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    const name = await this.retryStep(async () => {
      return this.getNameForMultisigAccount(client)
    })

    const { identity } = await this.retryStep(async () => {
      return this.createParticipant(client, name)
    })

    const { round1Result, totalParticipants } = await this.retryStep(async () => {
      return this.performRound1(client, name, identity)
    })

    const { round2Result, round1PublicPackages } = await this.retryStep(async () => {
      return this.performRound2(client, name, round1Result, totalParticipants)
    })

    await this.retryStep(async () => {
      await this.performRound3(
        client,
        name,
        round2Result,
        round1PublicPackages,
        totalParticipants,
      )
    })

    this.log('Multisig account created successfully using DKG!')
  }

  private async getNameForMultisigAccount(client: RpcClient): Promise<string> {
    const name = await ui.inputPrompt(
      'Enter a name for your account and participant identity',
      true,
    )

    const identities = (await client.wallet.multisig.getIdentities()).content.identities

    const accounts = (await client.wallet.getAccounts()).content.accounts

    const foundAccount = accounts.find((account) => account === name)

    if (foundAccount) {
      throw new Error(`Account with name ${name} already exists`)
    }

    const foundIdentity = identities.find((identity) => identity.name === name)

    if (foundIdentity) {
      throw new Error(`Identity with name ${name} already exists`)
    }

    return name
  }

  private async retryStep<T>(stepFunction: () => Promise<T>): Promise<T> {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        const result = await stepFunction()
        return result
      } catch (error) {
        this.logger.log(`An Error Occurred: ${(error as Error).message}`)
      }
    }
  }

  async createParticipant(
    client: RpcClient,
    name?: string,
  ): Promise<{ name: string; identity: string }> {
    if (!name) {
      name = await ui.inputPrompt('Enter a name for your participant identity', true)
    }

    const identity = (await client.wallet.multisig.createParticipant({ name })).content.identity

    this.log(`\nParticipant identity for ${name}: \n${identity} \n`)

    return { name, identity }
  }

  async collectStrings(
    item: string,
    count: number,
    additionalStrings: string[],
  ): Promise<string[]> {
    const array = []

    for (let i = 0; i < count; i++) {
      const input = await ui.longPrompt(`${item} #${i + 1}`, { required: true })
      array.push(input)
    }

    const result = [...array, ...additionalStrings]

    const withoutDuplicates = [...new Set(result)]

    if (withoutDuplicates.length !== result.length) {
      throw new Error(`Duplicate ${item} found in the list`)
    }

    return result
  }

  async performRound1(
    client: RpcClient,
    participantName: string,
    currentIdentity: string,
  ): Promise<{
    round1Result: { secretPackage: string; publicPackage: string }
    totalParticipants: number
  }> {
    this.log('\nCollecting Participant Info and Performing Round 1...')

    let input = await ui.inputPrompt('Enter the total number of participants', true)
    const totalParticipants = parseInt(input)
    if (isNaN(totalParticipants) || totalParticipants < 2) {
      throw new Error('Total number of participants must be at least 2')
    }

    this.logger.log(
      `\nEnter ${
        totalParticipants - 1
      } identities of all other participants (excluding yours) `,
    )
    const identities = await this.collectStrings('Identity', totalParticipants - 1, [
      currentIdentity,
    ])

    input = await ui.inputPrompt('Enter the number of minimum signers', true)
    const minSigners = parseInt(input)
    if (isNaN(minSigners) || minSigners < 2) {
      throw new Error('Minimum number of signers must be at least 2')
    }

    this.log('\nPerforming DKG Round 1...')
    const response = await client.wallet.multisig.dkg.round1({
      participantName,
      participants: identities.map((identity) => ({ identity })),
      minSigners,
    })

    this.log('\n============================================')
    this.log('\nRound 1 Encrypted Secret Package:')
    this.log(response.content.round1SecretPackage)

    this.log('\nRound 1 Public Package:')
    this.log(response.content.round1PublicPackage)
    this.log('\n============================================')

    this.log('\nShare your Round 1 Public Package with other participants.')
    return {
      round1Result: {
        secretPackage: response.content.round1SecretPackage,
        publicPackage: response.content.round1PublicPackage,
      },
      totalParticipants,
    }
  }

  async performRound2(
    client: RpcClient,
    participantName: string,
    round1Result: { secretPackage: string; publicPackage: string },
    totalParticipants: number,
  ): Promise<{
    round2Result: { secretPackage: string; publicPackage: string }
    round1PublicPackages: string[]
  }> {
    this.logger.log(
      `\nEnter ${totalParticipants - 1} Round 1 Public Packages (excluding yours) `,
    )
    const round1PublicPackages = await this.collectStrings(
      'Round 1 Public Package',
      totalParticipants - 1,
      [round1Result.publicPackage],
    )

    this.log('\nPerforming DKG Round 2...')

    const response = await client.wallet.multisig.dkg.round2({
      participantName,
      round1SecretPackage: round1Result.secretPackage,
      round1PublicPackages,
    })

    this.log('\n============================================')
    this.log('\nRound 2 Encrypted Secret Package:')
    this.log(response.content.round2SecretPackage)

    this.log('\nRound 2 Public Package:')
    this.log(response.content.round2PublicPackage)
    this.log('\n============================================')
    this.log('\nShare your Round 2 Public Package with other participants.')

    return {
      round2Result: {
        secretPackage: response.content.round2SecretPackage,
        publicPackage: response.content.round2PublicPackage,
      },
      round1PublicPackages,
    }
  }

  async performRound3(
    client: RpcClient,
    name: string,
    round2Result: { secretPackage: string; publicPackage: string },
    round1PublicPackages: string[],
    totalParticipants: number,
  ): Promise<void> {
    this.logger.log(
      `\nEnter ${totalParticipants - 1} Round 2 Public Packages (excluding yours) `,
    )

    const round2PublicPackages = await this.collectStrings(
      'Round 2 Public Package',
      totalParticipants - 1,
      [round2Result.publicPackage],
    )

    const response = await client.wallet.multisig.dkg.round3({
      participantName: name,
      accountName: name,
      round2SecretPackage: round2Result.secretPackage,
      round1PublicPackages,
      round2PublicPackages,
    })

    this.log(`Account Name: ${response.content.name}`)
    this.log(`Public Address: ${response.content.publicAddress}`)
  }
}
