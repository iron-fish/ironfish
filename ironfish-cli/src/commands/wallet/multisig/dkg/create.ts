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
  PromiseUtils,
  RpcClient,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import fs from 'fs'
import path from 'path'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import { MultisigBrokerUtils, MultisigClient } from '../../../../multisigBroker'
import * as ui from '../../../../ui'

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
    passphrase: Flags.string({
      description: 'Passphrase to join the multisig server session',
      dependsOn: ['server'],
    }),
    tls: Flags.boolean({
      description: 'connect to the multisig server over TLS',
      dependsOn: ['server'],
      allowNo: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgCreateCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let ledger: LedgerMultiSigner | undefined = undefined

    if (flags.ledger) {
      ledger = new LedgerMultiSigner(this.logger)
    }

    const accountName = await this.getAccountName(client, flags.name ?? flags.participant)

    let accountCreatedAt = flags.createdAt
    if (!accountCreatedAt) {
      const statusResponse = await client.node.getStatus()
      accountCreatedAt = statusResponse.content.blockchain.head.sequence
    }

    let multisigClient: MultisigClient | null = null
    if (flags.server) {
      let sessionId = flags.sessionId
      if (!sessionId) {
        sessionId = await ui.inputPrompt(
          'Enter the ID of a multisig session to join, or press enter to start a new session',
          false,
        )
      }

      let passphrase = flags.passphrase
      if (!passphrase) {
        passphrase = await ui.inputPrompt('Enter the passphrase for the multisig session', true)
      }

      multisigClient = await MultisigBrokerUtils.createClient(flags.server, {
        passphrase,
        tls: flags.tls ?? true,
        logger: this.logger,
      })
      multisigClient.start()

      let connectionConfirmed = false

      multisigClient.onConnectedMessage.on(() => {
        connectionConfirmed = true
        Assert.isNotNull(multisigClient)
        multisigClient.onConnectedMessage.clear()
      })

      if (sessionId) {
        while (!connectionConfirmed) {
          await PromiseUtils.sleep(500)
          continue
        }

        multisigClient.joinSession(sessionId)
      }
    }

    const { totalParticipants, minSigners } = await ui.retryStep(
      async () => {
        return this.getDkgConfig(multisigClient, !!ledger)
      },
      this.logger,
      true,
    )

    const { name: participantName, identity } = await this.getOrCreateIdentity(
      client,
      ledger,
      accountName,
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

  private async getOrCreateIdentity(
    client: RpcClient,
    ledger: LedgerMultiSigner | undefined,
    name: string,
  ): Promise<{
    identity: string
    name: string
  }> {
    const identities = await client.wallet.multisig.getIdentities()

    if (ledger) {
      const ledgerIdentity = await ui.ledger({
        ledger,
        message: 'Getting Ledger Identity',
        action: () => ledger.dkgGetIdentity(0),
      })

      const foundIdentity = identities.content.identities.find(
        (i) => i.identity === ledgerIdentity.toString('hex'),
      )

      if (foundIdentity) {
        this.debug('Identity from ledger already exists')
        return foundIdentity
      }

      // We must use the ledger's identity
      while (identities.content.identities.find((i) => i.name === name)) {
        this.log('An identity with the same name already exists')
        name = await ui.inputPrompt('Enter a new name for the identity', true)
      }

      const created = await client.wallet.multisig.importParticipant({
        name,
        identity: ledgerIdentity.toString('hex'),
      })

      return { name, identity: created.content.identity }
    }

    const foundIdentity = identities.content.identities.find((i) => i.name === name)

    if (foundIdentity) {
      this.debug(`Identity already exists with name: ${foundIdentity.name}`)
      return foundIdentity
    }

    const created = await client.wallet.multisig.createParticipant({ name })
    return { name, identity: created.content.identity }
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

  async getDkgConfig(
    multisigClient: MultisigClient | null,
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

      ux.action.start('Waiting for signer config from server')
      while (waiting) {
        multisigClient.getDkgStatus()
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
      this.log('\nStarted new DKG session:')
      this.log(`${multisigClient.sessionId}`)
    }

    return { totalParticipants, minSigners }
  }

  async performRound1WithLedger(
    ledger: LedgerMultiSigner,
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
    const { publicPackage, secretPackage } = await ui.ledger({
      ledger,
      message: 'Round1 on Ledger',
      approval: true,
      action: () => ledger.dkgRound1(0, identities, minSigners),
    })

    return {
      round1: {
        secretPackage: secretPackage.toString('hex'),
        publicPackage: publicPackage.toString('hex'),
      },
    }
  }

  async performRound1(
    client: RpcClient,
    multisigClient: MultisigClient | null,
    participantName: string,
    currentIdentity: string,
    totalParticipants: number,
    minSigners: number,
    ledger: LedgerMultiSigner | undefined,
  ): Promise<{
    round1: { secretPackage: string; publicPackage: string }
  }> {
    this.log('\nCollecting Participant Info and Performing Round 1...')

    let identities: string[] = [currentIdentity]
    if (!multisigClient) {
      this.log(`Identity for ${participantName}: \n${currentIdentity} \n`)

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
      multisigClient.submitDkgIdentity(currentIdentity)

      multisigClient.onDkgStatus.on((message) => {
        identities = message.identities
      })

      ux.action.start('Waiting for Identities from server')
      while (identities.length < totalParticipants) {
        multisigClient.getDkgStatus()
        ux.action.status = `${identities.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
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
    ledger: LedgerMultiSigner,
    round1PublicPackages: string[],
    round1SecretPackage: string,
  ): Promise<{
    round2: { secretPackage: string; publicPackage: string }
  }> {
    // TODO(hughy): determine how to handle multiple identities using index
    const { publicPackage, secretPackage } = await ui.ledger({
      ledger,
      message: 'Round2 on Ledger',
      approval: true,
      action: () => ledger.dkgRound2(0, round1PublicPackages, round1SecretPackage),
    })

    return {
      round2: {
        secretPackage: secretPackage.toString('hex'),
        publicPackage: publicPackage.toString('hex'),
      },
    }
  }

  async performRound2(
    client: RpcClient,
    multisigClient: MultisigClient | null,
    participantName: string,
    round1Result: { secretPackage: string; publicPackage: string },
    totalParticipants: number,
    ledger: LedgerMultiSigner | undefined,
  ): Promise<{
    round2: { secretPackage: string; publicPackage: string }
    round1PublicPackages: string[]
  }> {
    let round1PublicPackages: string[] = [round1Result.publicPackage]
    if (!multisigClient) {
      this.log('\n============================================')
      this.debug('\nRound 1 Encrypted Secret Package:')
      this.debug(round1Result.secretPackage)

      this.log('\nRound 1 Public Package:')
      this.log(round1Result.publicPackage)
      this.log('\n============================================')

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

      ux.action.start('Waiting for Round 1 Public Packages from server')
      while (round1PublicPackages.length < totalParticipants) {
        multisigClient.getDkgStatus()
        ux.action.status = `${round1PublicPackages.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
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
    ledger: LedgerMultiSigner,
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
    const participants: string[] = []
    const round1FrostPackages: string[] = []
    const gskBytes: string[] = []
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
    await ui.ledger({
      ledger,
      message: 'Round3 on Ledger',
      approval: true,
      action: () =>
        ledger.dkgRound3(
          0,
          participants,
          round1FrostPackages,
          round2FrostPackages,
          round2SecretPackage,
          gskBytes,
        ),
    })

    // Retrieve all multisig account keys and publicKeyPackage
    const dkgKeys = await ui.ledger({
      ledger,
      message: 'Getting Ledger DKG keys',
      action: () => ledger.dkgRetrieveKeys(),
    })

    const publicKeyPackage = await ui.ledger({
      ledger,
      message: 'Getting Ledger Public Package',
      action: () => ledger.dkgGetPublicPackage(),
    })

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

    const encryptedKeys = await ui.ledger({
      ledger,
      message: 'Backup DKG Keys',
      approval: true,
      action: () => ledger.dkgBackupKeys(),
    })

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
    multisigClient: MultisigClient | null,
    accountName: string,
    participantName: string,
    round2Result: { secretPackage: string; publicPackage: string },
    round1PublicPackages: string[],
    totalParticipants: number,
    ledger: LedgerMultiSigner | undefined,
    accountCreatedAt?: number,
  ): Promise<void> {
    let round2PublicPackages: string[] = [round2Result.publicPackage]
    if (!multisigClient) {
      this.log('\n============================================')
      this.debug('\nRound 2 Encrypted Secret Package:')
      this.debug(round2Result.secretPackage)

      this.log('\nRound 2 Public Package:')
      this.log(round2Result.publicPackage)
      this.log('\n============================================')

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

      ux.action.start('Waiting for Round 2 Public Packages from server')
      while (round2PublicPackages.length < totalParticipants) {
        multisigClient.getDkgStatus()
        ux.action.status = `${round2PublicPackages.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onDkgStatus.clear()
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

    this.log()
    this.log(`Account Name: ${response.content.name}`)
    this.log(`Public Address: ${response.content.publicAddress}`)
  }
}
