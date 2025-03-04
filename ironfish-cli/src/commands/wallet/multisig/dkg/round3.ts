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
  encodeAccountImport,
  RpcClient,
} from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { IronfishCommand } from '../../../../command'
import { RemoteFlags } from '../../../../flags'
import { LedgerMultiSigner } from '../../../../ledger'
import * as ui from '../../../../ui'
import { importAccount } from '../../../../utils'

export class DkgRound3Command extends IronfishCommand {
  static description = 'Perform round3 of the DKG protocol for multisig account creation'

  static flags = {
    ...RemoteFlags,
    participantName: Flags.string({
      char: 'n',
      description: 'The name of the secret to use for decryption during DKG',
      aliases: ['name'],
    }),
    accountName: Flags.string({
      char: 'a',
      description: 'The name to set for the imported account',
    }),
    round2SecretPackage: Flags.string({
      char: 'e',
      description: 'The encrypted secret package created during DKG round 2',
    }),
    round1PublicPackages: Flags.string({
      char: 'p',
      description:
        'The public package that a participant generated during DKG round 1 (may be specified multiple times for multiple participants). Must include your own round 1 public package',
      multiple: true,
    }),
    round2PublicPackages: Flags.string({
      char: 'q',
      description:
        'The public package that a participant generated during DKG round 2 (may be specified multiple times for multiple participants). Your own round 2 public package is optional; if included, it will be ignored',
      multiple: true,
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
      exclusive: ['participantName'],
    }),
    createdAt: Flags.integer({
      description:
        "Block sequence to begin scanning from for the created account. Uses node's chain head by default.",
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DkgRound3Command)

    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let round2SecretPackage = flags.round2SecretPackage
    if (!round2SecretPackage) {
      round2SecretPackage = await ui.inputPrompt(
        'Enter your round 2 encrypted secret package',
        true,
      )
    }

    let round1PublicPackages = flags.round1PublicPackages
    if (!round1PublicPackages || round1PublicPackages.length < 2) {
      const input = await ui.longPrompt(
        'Enter round 1 public packages, separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round1PublicPackages = input.split(',')

      if (round1PublicPackages.length < 2) {
        this.error(
          'Must include a round 1 public package for each participant; at least 2 participants required',
        )
      }
    }
    round1PublicPackages = round1PublicPackages.map((i) => i.trim())

    let round2PublicPackages = flags.round2PublicPackages
    if (!round2PublicPackages) {
      const input = await ui.longPrompt(
        'Enter round 2 public packages, separated by commas, one for each participant',
        {
          required: true,
        },
      )
      round2PublicPackages = input.split(',')

      // Our own public package is optional in this step (if provided, it will
      // be ignored), so we can accept both `n` and `n-1` packages
      if (
        round2PublicPackages.length < round1PublicPackages.length - 1 ||
        round2PublicPackages.length > round1PublicPackages.length
      ) {
        // Suggest to provide `n-1` packages; don't mention the `n` case to
        // avoid making the error message too hard to decipher.
        this.error(
          'The number of round 2 public packages should be 1 less than the number of round 1 public packages',
        )
      }
    }
    round2PublicPackages = round2PublicPackages.map((i) => i.trim())

    let accountCreatedAt = flags.createdAt
    if (!accountCreatedAt) {
      const statusResponse = await client.node.getStatus()
      accountCreatedAt = statusResponse.content.blockchain.head.sequence
    }

    if (flags.ledger) {
      let accountName = flags.accountName
      if (!accountName) {
        accountName = await ui.inputPrompt('Enter a name for the account', true)
      }

      await this.performRound3WithLedger(
        client,
        accountName,
        round1PublicPackages,
        round2PublicPackages,
        round2SecretPackage,
        accountCreatedAt,
      )
      return
    }

    let participantName = flags.participantName
    if (!participantName) {
      participantName = await ui.multisigSecretPrompt(client)
    }

    const response = await client.wallet.multisig.dkg.round3({
      participantName,
      accountName: flags.accountName,
      round2SecretPackage,
      round1PublicPackages,
      round2PublicPackages,
      accountCreatedAt,
    })

    this.log()
    this.log(
      `Account ${response.content.name} imported with public address: ${response.content.publicAddress}`,
    )
  }

  async performRound3WithLedger(
    client: RpcClient,
    accountName: string,
    round1PublicPackagesStr: string[],
    round2PublicPackagesStr: string[],
    round2SecretPackage: string,
    accountCreatedAt?: number,
  ): Promise<void> {
    const ledger = new LedgerMultiSigner()

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
      spendingKey: null,
      createdAt: null,
      ledger: true,
    }

    // Import multisig account
    const { name } = await importAccount(
      client,
      encodeAccountImport(accountImport, AccountFormat.Base64Json),
      this.logger,
      accountName,
      accountCreatedAt,
    )

    this.log()
    this.log(`Account ${name} imported with public address: ${dkgKeys.publicAddress}`)

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
  }
}
