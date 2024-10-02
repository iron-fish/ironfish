/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  deserializePublicPackage,
  deserializeRound2CombinedPublicPackage,
} from '@ironfish/rust-nodejs'
import {
  ACCOUNT_SCHEMA_VERSION,
  AccountFormat,
  Assert,
  encodeAccountImport,
  parseUrl,
  PromiseUtils,
  RpcClient,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import dns from 'dns'
import fs from 'fs'
import path from 'path'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { MultisigTcpClient } from '../../../../multisigBroker'
import * as ui from '../../../../ui'
import { LedgerDkg } from '../../../../utils/ledger'

export class DkgCreateCommand extends IronfishCommand {
  static description = 'Interactive command to create a multisignature account using DKG'

  static flags = {
    ...RemoteFlags,
    participant: Flags.string({
      char: 'n',
      description: 'The name of the secret to use for encryption during DKG',
    }),
    name: Flags.string({
      char: 'a',
      description: 'The name to set for multisig account to be created',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
    }),
    createdAt: Flags.integer({
      description:
        "Block sequence to begin scanning from for the created account. Uses node's chain head by default",
    }),
    server: Flags.string({
      description: "multisig server to connect to. formatted as '<host>:<port>'",
    }),
    sessionId: Flags.string({
      description: 'Unique ID for a multisig server session to join',
      dependsOn: ['server'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgCreateCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let ledger: LedgerDkg | undefined = undefined

    if (flags.ledger) {
      ledger = new LedgerDkg(this.logger)
      try {
        await ledger.connect()
      } catch (e) {
        if (e instanceof Error) {
          this.error(e.message)
        } else {
          throw e
        }
      }
    }

    const accountName = await this.getAccountName(client, flags.name)

    let accountCreatedAt = flags.createdAt
    if (!accountCreatedAt) {
      const statusResponse = await client.node.getStatus()
      accountCreatedAt = statusResponse.content.blockchain.head.sequence
    }

    let multisigClient: MultisigTcpClient | null = null
    if (flags.server) {
      const parsed = parseUrl(flags.server)

      Assert.isNotNull(parsed.hostname)
      Assert.isNotNull(parsed.port)

      const resolved = await dns.promises.lookup(parsed.hostname)
      const host = resolved.address
      const port = parsed.port

      multisigClient = new MultisigTcpClient({ host, port, logger: this.logger })
      multisigClient.start()

      if (flags.sessionId) {
        multisigClient.joinSession(flags.sessionId)
      }
    }

    const { name: participantName, identity } = ledger
      ? await ui.retryStep(
          () => {
            Assert.isNotUndefined(ledger)
            return this.getIdentityFromLedger(ledger, client, flags.participant)
          },
          this.logger,
          true,
        )
      : await this.getParticipant(client, flags.participant)

    this.log(`Identity for ${participantName}: \n${identity} \n`)

    const { totalParticipants, minSigners } = await ui.retryStep(
      async () => {
        return this.getDkgConfig(multisigClient, !!ledger)
      },
      this.logger,
      true,
    )

    const { round1 } = await ui.retryStep(
      async () => {
        return this.performRound1(
          client,
          multisigClient,
          participantName,
          identity,
          totalParticipants,
          minSigners,
          ledger,
        )
      },
      this.logger,
      true,
    )

    this.log('\n============================================')
    this.log('\nRound 1 Encrypted Secret Package:')
    this.log(round1.secretPackage)

    this.log('\nRound 1 Public Package:')
    this.log(round1.publicPackage)
    this.log('\n============================================')

    const { round2: round2Result, round1PublicPackages } = await ui.retryStep(
      async () => {
        return this.performRound2(
          client,
          multisigClient,
          participantName,
          round1,
          totalParticipants,
          ledger,
        )
      },
      this.logger,
      true,
    )

    this.log('\n============================================')
    this.log('\nRound 2 Encrypted Secret Package:')
    this.log(round2Result.secretPackage)

    this.log('\nRound 2 Public Package:')
    this.log(round2Result.publicPackage)
    this.log('\n============================================')

    await ui.retryStep(
      async () => {
        return this.performRound3(
          client,
          multisigClient,
          accountName,
          participantName,
          round2Result,
          round1PublicPackages,
          totalParticipants,
          ledger,
          accountCreatedAt,
        )
      },
      this.logger,
      true,
    )

    this.log('Multisig account created successfully using DKG!')
    multisigClient?.stop()
  }

  private async getParticipant(client: RpcClient, participantName?: string) {
    const identities = (await client.wallet.multisig.getIdentities()).content.identities

    if (participantName) {
      const foundIdentity = identities.find((i) => i.name === participantName)
      if (!foundIdentity) {
        throw new Error(`Participant with name ${participantName} not found`)
      }

      return {
        name: foundIdentity.name,
        identity: foundIdentity.identity,
      }
    }

    const name = await ui.inputPrompt('Enter the name of the participant', true)
    const foundIdentity = identities.find((i) => i.name === name)

    if (foundIdentity) {
      this.log('Found an identity with the same name')

      return {
        ...foundIdentity,
      }
    }

    const identity = (await client.wallet.multisig.createParticipant({ name })).content.identity

    return {
      name,
      identity,
    }
  }

  private async getAccountName(client: RpcClient, name?: string) {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (!name) {
        name = await ui.inputPrompt('Enter a name for the multisig account', true)
      }

      const accounts = (await client.wallet.getAccounts()).content.accounts

      if (accounts.find((a) => a === name)) {
        this.log('An account with the same name already exists')
        name = undefined
        continue
      }

      break
    }

    return name
  }

  async getIdentityFromLedger(
    ledger: LedgerDkg,
    client: RpcClient,
    name?: string,
  ): Promise<{
    name: string
    identity: string
  }> {
    // TODO(hughy): support multiple identities using index
    const identity = await ledger.dkgGetIdentity(0)

    const allIdentities = (await client.wallet.multisig.getIdentities()).content.identities

    const foundIdentity = allIdentities.find((i) => i.identity === identity.toString('hex'))

    if (foundIdentity) {
      this.log(`Identity already exists with name: ${foundIdentity.name}`)

      return {
        name: foundIdentity.name,
        identity: identity.toString('hex'),
      }
    }

    name = await ui.inputPrompt('Enter a name for the identity', true)

    while (allIdentities.find((i) => i.name === name)) {
      this.log('An identity with the same name already exists')
      name = await ui.inputPrompt('Enter a new name for the identity', true)
    }

    await client.wallet.multisig.importParticipant({
      name,
      identity: identity.toString('hex'),
    })

    return {
      name,
      identity: identity.toString('hex'),
    }
  }

  async createParticipant(
    client: RpcClient,
    name: string,
  ): Promise<{
    name: string
    identity: string
  }> {
    const identity = (await client.wallet.multisig.createParticipant({ name })).content.identity
    return {
      name,
      identity,
    }
  }

  async getDkgConfig(
    multisigClient: MultisigTcpClient | null,
    ledger: boolean,
  ): Promise<{ totalParticipants: number; minSigners: number }> {
    if (multisigClient?.sessionId) {
      let totalParticipants = 0
      let minSigners = 0
      let waiting = true
      multisigClient.onDkgStatus.on((message) => {
        totalParticipants = message.maxSigners
        minSigners = message.minSigners
        waiting = false
      })
      multisigClient.getDkgStatus()

      ux.action.start('Waiting for signer config from server')
      while (waiting) {
        await PromiseUtils.sleep(3000)
      }
      multisigClient.onDkgStatus.clear()
      ux.action.stop()

      return { totalParticipants, minSigners }
    }

    const totalParticipants = await ui.inputNumberPrompt(
      this.logger,
      'Enter the total number of participants',
      { required: true, integer: true },
    )

    if (totalParticipants < 2) {
      throw new Error('Total number of participants must be at least 2')
    }

    if (ledger && totalParticipants > 4) {
      throw new Error('DKG with Ledger supports a maximum of 4 participants')
    }

    const minSigners = await ui.inputNumberPrompt(
      this.logger,
      'Enter the number of minimum signers',
      { required: true, integer: true },
    )

    if (minSigners < 2 || minSigners > totalParticipants) {
      throw new Error(
        'Minimum number of signers must be between 2 and the total number of participants',
      )
    }

    if (multisigClient) {
      multisigClient.startDkgSession(totalParticipants, minSigners)
      this.log(`Started new DKG server session with ID ${multisigClient.sessionId}`)
    }

    return { totalParticipants, minSigners }
  }

  async performRound1WithLedger(
    ledger: LedgerDkg,
    client: RpcClient,
    participantName: string,
    identities: string[],
    minSigners: number,
  ): Promise<{
    round1: { secretPackage: string; publicPackage: string }
  }> {
    const identityResponse = await client.wallet.multisig.getIdentity({ name: participantName })
    const identity = identityResponse.content.identity

    if (!identities.includes(identity)) {
      identities.push(identity)
    }

    // TODO(hughy): determine how to handle multiple identities using index
    const { publicPackage, secretPackage } = await ledger.dkgRound1(0, identities, minSigners)

    return {
      round1: {
        secretPackage: secretPackage.toString('hex'),
        publicPackage: publicPackage.toString('hex'),
      },
    }
  }

  async performRound1(
    client: RpcClient,
    multisigClient: MultisigTcpClient | null,
    participantName: string,
    currentIdentity: string,
    totalParticipants: number,
    minSigners: number,
    ledger: LedgerDkg | undefined,
  ): Promise<{
    round1: { secretPackage: string; publicPackage: string }
  }> {
    this.log('\nCollecting Participant Info and Performing Round 1...')

    let identities: string[] = []
    if (!multisigClient) {
      this.log(
        `\nEnter ${
          totalParticipants - 1
        } identities of all other participants (excluding yours) `,
      )
      identities = await ui.collectStrings('Participant Identity', totalParticipants - 1, {
        additionalStrings: [currentIdentity],
        errorOnDuplicate: true,
      })
    } else {
      multisigClient.submitIdentity(currentIdentity)

      multisigClient.onDkgStatus.on((message) => {
        identities = message.identities
      })
      multisigClient.onIdentity.on((message) => {
        if (!identities.includes(message.identity)) {
          identities.push(message.identity)
        }
      })

      ux.action.start('Waiting for other Identities from server')
      while (identities.length < totalParticipants) {
        multisigClient.getDkgStatus()
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
      multisigClient.onIdentity.clear()
      ux.action.stop()
    }

    if (ledger) {
      return await this.performRound1WithLedger(
        ledger,
        client,
        participantName,
        identities,
        minSigners,
      )
    }

    this.log('\nPerforming DKG Round 1...')
    const response = await client.wallet.multisig.dkg.round1({
      participantName,
      participants: identities.map((identity) => ({ identity })),
      minSigners,
    })

    return {
      round1: {
        secretPackage: response.content.round1SecretPackage,
        publicPackage: response.content.round1PublicPackage,
      },
    }
  }

  async performRound2WithLedger(
    ledger: LedgerDkg,
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<{
    round2: { secretPackage: string; publicPackage: string }
  }> {
    // TODO(hughy): determine how to handle multiple identities using index
    const { publicPackage, secretPackage } = await ledger.dkgRound2(
      0,
      round1PublicPackages,
      round1SecretPackage,
    )

    return {
      round2: {
        secretPackage: secretPackage.toString('hex'),
        publicPackage: publicPackage.toString('hex'),
      },
    }
  }

  async performRound2(
    client: RpcClient,
    multisigClient: MultisigTcpClient | null,
    participantName: string,
    round1Result: { secretPackage: string; publicPackage: string },
    totalParticipants: number,
    ledger: LedgerDkg | undefined,
  ): Promise<{
    round2: { secretPackage: string; publicPackage: string }
    round1PublicPackages: string[]
  }> {
    let round1PublicPackages: string[] = []
    if (!multisigClient) {
      this.log('\nShare your Round 1 Public Package with other participants.')
      this.log(`\nEnter ${totalParticipants - 1} Round 1 Public Packages (excluding yours) `)

      round1PublicPackages = await ui.collectStrings(
        'Round 1 Public Package',
        totalParticipants - 1,
        {
          additionalStrings: [round1Result.publicPackage],
          errorOnDuplicate: true,
        },
      )
    } else {
      multisigClient.submitRound1PublicPackage(round1Result.publicPackage)
      multisigClient.onDkgStatus.on((message) => {
        round1PublicPackages = message.round1PublicPackages
      })
      multisigClient.onRound1PublicPackage.on((message) => {
        if (!round1PublicPackages.includes(message.package)) {
          round1PublicPackages.push(message.package)
        }
      })

      ux.action.start('Waiting for other Round 1 Public Packages from server')
      while (round1PublicPackages.length < totalParticipants) {
        multisigClient.getDkgStatus()
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
      multisigClient.onRound1PublicPackage.clear()
      ux.action.stop()
    }

    this.log('\nPerforming DKG Round 2...')

    if (ledger) {
      const result = await this.performRound2WithLedger(
        ledger,
        round1PublicPackages,
        round1Result.secretPackage,
      )
      return {
        ...result,
        round1PublicPackages,
      }
    }

    const response = await client.wallet.multisig.dkg.round2({
      participantName,
      round1SecretPackage: round1Result.secretPackage,
      round1PublicPackages,
    })

    return {
      round2: {
        secretPackage: response.content.round2SecretPackage,
        publicPackage: response.content.round2PublicPackage,
      },
      round1PublicPackages,
    }
  }

  async performRound3WithLedger(
    ledger: LedgerDkg,
    client: RpcClient,
    accountName: string,
    participantName: string,
    round1PublicPackagesStr: string[],
    round2PublicPackagesStr: string[],
    round2SecretPackage: string,
    accountCreatedAt?: number,
  ): Promise<void> {
    const identityResponse = await client.wallet.multisig.getIdentity({ name: participantName })
    const identity = identityResponse.content.identity

    // Sort packages by identity
    const round1PublicPackages = round1PublicPackagesStr
      .map(deserializePublicPackage)
      .sort((a, b) => a.identity.localeCompare(b.identity))

    // Filter out packages not intended for participant and sort by sender identity
    const round2CombinedPublicPackages = round2PublicPackagesStr.map(
      deserializeRound2CombinedPublicPackage,
    )
    const round2PublicPackages = round2CombinedPublicPackages
      .flatMap((combined) =>
        combined.packages.filter((pkg) => pkg.recipientIdentity === identity),
      )
      .sort((a, b) => a.senderIdentity.localeCompare(b.senderIdentity))

    // Extract raw parts from round1 and round2 public packages
    const participants = []
    const round1FrostPackages = []
    const gskBytes = []
    for (const pkg of round1PublicPackages) {
      // Exclude participant's own identity and round1 public package
      if (pkg.identity !== identity) {
        participants.push(pkg.identity)
        round1FrostPackages.push(pkg.frostPackage)
      }

      gskBytes.push(pkg.groupSecretKeyShardEncrypted)
    }

    const round2FrostPackages = round2PublicPackages.map((pkg) => pkg.frostPackage)

    // Perform round3 with Ledger
    await ledger.dkgRound3(
      0,
      participants,
      round1FrostPackages,
      round2FrostPackages,
      round2SecretPackage,
      gskBytes,
    )

    // Retrieve all multisig account keys and publicKeyPackage
    const dkgKeys = await ledger.dkgRetrieveKeys()

    const publicKeyPackage = await ledger.dkgGetPublicPackage()

    const accountImport = {
      ...dkgKeys,
      multisigKeys: {
        publicKeyPackage: publicKeyPackage.toString('hex'),
        identity,
      },
      version: ACCOUNT_SCHEMA_VERSION,
      name: accountName,
      createdAt: null,
      spendingKey: null,
    }

    // Import multisig account
    const response = await client.wallet.importAccount({
      account: encodeAccountImport(accountImport, AccountFormat.Base64Json),
      createdAt: accountCreatedAt,
    })

    this.log()
    this.log(
      `Account ${response.content.name} imported with public address: ${dkgKeys.publicAddress}`,
    )

    this.log()
    this.log('Creating an encrypted backup of multisig keys from your Ledger device...')
    this.log()

    const encryptedKeys = await ledger.dkgBackupKeys()

    this.log()
    this.log('Encrypted Ledger Multisig Backup:')
    this.log(encryptedKeys.toString('hex'))
    this.log()
    this.log('Please save the encrypted keys shown above.')
    this.log(
      'Use `ironfish wallet:multisig:ledger:restore` if you need to restore the keys to your Ledger.',
    )

    const dataDir = this.sdk.fileSystem.resolve(this.sdk.dataDir)
    const backupKeysPath = path.join(dataDir, `ironfish-ledger-${accountName}.txt`)

    if (fs.existsSync(backupKeysPath)) {
      await ui.confirmOrQuit(
        `Error when backing up your keys: \nThe file ${backupKeysPath} already exists. \nOverwrite?`,
      )
    }

    await fs.promises.writeFile(backupKeysPath, encryptedKeys.toString('hex'))
    this.log(`A copy of your encrypted keys have been saved at ${backupKeysPath}`)
  }

  async performRound3(
    client: RpcClient,
    multisigClient: MultisigTcpClient | null,
    accountName: string,
    participantName: string,
    round2Result: { secretPackage: string; publicPackage: string },
    round1PublicPackages: string[],
    totalParticipants: number,
    ledger: LedgerDkg | undefined,
    accountCreatedAt?: number,
  ): Promise<void> {
    let round2PublicPackages: string[] = []
    if (!multisigClient) {
      this.log('\nShare your Round 2 Public Package with other participants.')
      this.log(`\nEnter ${totalParticipants - 1} Round 2 Public Packages (excluding yours) `)

      round2PublicPackages = await ui.collectStrings(
        'Round 2 Public Package',
        totalParticipants - 1,
        {
          additionalStrings: [round2Result.publicPackage],
          errorOnDuplicate: true,
        },
      )
    } else {
      multisigClient.submitRound2PublicPackage(round2Result.publicPackage)
      multisigClient.onDkgStatus.on((message) => {
        round2PublicPackages = message.round2PublicPackages
      })
      multisigClient.onRound2PublicPackage.on((message) => {
        if (!round2PublicPackages.includes(message.package)) {
          round2PublicPackages.push(message.package)
        }
      })

      ux.action.start('Waiting for other Round 2 Public Packages from server')
      while (round2PublicPackages.length < totalParticipants) {
        multisigClient.getDkgStatus()
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
      multisigClient.onRound2PublicPackage.clear()
      ux.action.stop()
    }

    if (ledger) {
      await this.performRound3WithLedger(
        ledger,
        client,
        accountName,
        participantName,
        round1PublicPackages,
        round2PublicPackages,
        round2Result.secretPackage,
        accountCreatedAt,
      )
      return
    }

    const response = await client.wallet.multisig.dkg.round3({
      participantName: participantName,
      accountName: accountName,
      round2SecretPackage: round2Result.secretPackage,
      round1PublicPackages,
      round2PublicPackages,
    })

    this.log(`Account Name: ${response.content.name}`)
    this.log(`Public Address: ${response.content.publicAddress}`)
  }
}
