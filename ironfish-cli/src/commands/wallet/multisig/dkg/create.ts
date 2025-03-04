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
  RpcClient,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import fs from 'fs'
import path from 'path'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'
import {
  createDkgSessionManager,
  DkgSessionManager,
} from '../../../../utils/multisig/sessionManagers'

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
    server: Flags.boolean({
      description: 'connect to a multisig broker server',
    }),
    connection: Flags.string({
      char: 'c',
      description: 'connection string for a multisig server session',
    }),
    hostname: Flags.string({
      description: 'hostname of the multisig broker server to connect to',
    }),
    port: Flags.integer({
      description: 'port to connect to on the multisig broker server',
    }),
    sessionId: Flags.string({
      description: 'Unique ID for a multisig server session to join',
    }),
    passphrase: Flags.string({
      description: 'Passphrase to join the multisig server session',
    }),
    tls: Flags.boolean({
      description: 'connect to the multisig server over TLS',
      allowNo: true,
    }),
    minSigners: Flags.integer({
      description: 'Minimum signers required to sign a transaction',
      exclusive: ['sessionId'],
    }),
    totalParticipants: Flags.integer({
      description: 'The total number of participants for the multisig account',
      exclusive: ['sessionId'],
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgCreateCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let ledger: LedgerMultiSigner | undefined = undefined

    if (flags.ledger) {
      ledger = new LedgerMultiSigner()
    }

    const accountName = await this.getAccountName(client, flags.name ?? flags.participant)

    let accountCreatedAt = flags.createdAt
    if (!accountCreatedAt) {
      const statusResponse = await client.node.getStatus()
      accountCreatedAt = statusResponse.content.blockchain.head.sequence
    }

    const { name: participantName, identity } = await this.getOrCreateIdentity(
      client,
      ledger,
      accountName,
    )

    const sessionManager = createDkgSessionManager({
      server: flags.server,
      connection: flags.connection,
      hostname: flags.hostname,
      port: flags.port,
      passphrase: flags.passphrase,
      sessionId: flags.sessionId,
      tls: flags.tls,
      logger: this.logger,
    })

    const { totalParticipants, minSigners } = await ui.retryStep(
      async () => {
        return sessionManager.startSession({
          totalParticipants: flags.totalParticipants,
          minSigners: flags.minSigners,
          ledger: flags.ledger,
          identity,
        })
      },
      this.logger,
      true,
    )

    const { round1 } = await ui.retryStep(
      async () => {
        return this.performRound1(
          client,
          sessionManager,
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
          sessionManager,
          accountName,
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
          sessionManager,
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

    if (ledger) {
      await ui.retryStep(
        async () => {
          Assert.isNotUndefined(ledger)
          return this.createBackup(ledger, accountName)
        },
        this.logger,
        true,
      )
    }

    this.log('Multisig account created successfully using DKG!')
    sessionManager.endSession()
  }

  private async createBackup(ledger: LedgerMultiSigner, accountName: string) {
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

  private async getOrCreateIdentity(
    client: RpcClient,
    ledger: LedgerMultiSigner | undefined,
    name: string,
  ): Promise<{
    identity: string
    name: string
  }> {
    if (ledger) {
      const ledgerIdentity = (
        await ui.ledger({
          ledger,
          message: 'Getting Ledger Identity',
          action: () => ledger.dkgGetIdentity(0),
        })
      ).toString('hex')

      return { name, identity: ledgerIdentity }
    }

    const identities = await client.wallet.multisig.getIdentities()

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

  async performRound1WithLedger(
    ledger: LedgerMultiSigner,
    identities: string[],
    minSigners: number,
  ): Promise<{
    round1: { secretPackage: string; publicPackage: string }
  }> {
    const identity = (
      await ui.ledger({
        ledger,
        message: 'Getting Ledger Identity',
        action: () => ledger.dkgGetIdentity(0),
      })
    ).toString('hex')

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
    sessionManager: DkgSessionManager,
    participantName: string,
    currentIdentity: string,
    totalParticipants: number,
    minSigners: number,
    ledger: LedgerMultiSigner | undefined,
  ): Promise<{
    round1: { secretPackage: string; publicPackage: string }
  }> {
    this.log('\nCollecting Participant Info and Performing Round 1...')

    const identities = await sessionManager.getIdentities({
      identity: currentIdentity,
      totalParticipants,
      accountName: participantName,
    })

    if (ledger) {
      return await this.performRound1WithLedger(ledger, identities, minSigners)
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
    sessionManager: DkgSessionManager,
    accountName: string,
    participantName: string,
    round1Result: { secretPackage: string; publicPackage: string },
    totalParticipants: number,
    ledger: LedgerMultiSigner | undefined,
  ): Promise<{
    round2: { secretPackage: string; publicPackage: string }
    round1PublicPackages: string[]
  }> {
    const round1PublicPackages = await sessionManager.getRound1PublicPackages({
      accountName,
      round1PublicPackage: round1Result.publicPackage,
      round1SecretPackage: round1Result.secretPackage,
      totalParticipants,
    })

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
    round1PublicPackagesStr: string[],
    round2PublicPackagesStr: string[],
    round2SecretPackage: string,
    accountCreatedAt?: number,
  ): Promise<void> {
    const identity = (
      await ui.ledger({
        ledger,
        message: 'Getting Ledger Identity',
        action: () => ledger.dkgGetIdentity(0),
      })
    ).toString('hex')

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
      ledger: true,
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
  }

  async performRound3(
    client: RpcClient,
    sessionManager: DkgSessionManager,
    accountName: string,
    participantName: string,
    round2Result: { secretPackage: string; publicPackage: string },
    round1PublicPackages: string[],
    totalParticipants: number,
    ledger: LedgerMultiSigner | undefined,
    accountCreatedAt?: number,
  ): Promise<void> {
    const round2PublicPackages = await sessionManager.getRound2PublicPackages({
      accountName,
      round2PublicPackage: round2Result.publicPackage,
      round2SecretPackage: round2Result.secretPackage,
      totalParticipants,
    })

    if (ledger) {
      await this.performRound3WithLedger(
        ledger,
        client,
        accountName,
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
