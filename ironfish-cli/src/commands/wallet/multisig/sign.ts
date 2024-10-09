/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { multisig } from '@ironfish/rust-nodejs'
import {
  Assert,
  CurrencyUtils,
  Identity,
  PromiseUtils,
  RpcClient,
  Transaction,
  UnsignedTransaction,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { LedgerMultiSigner } from '../../../ledger'
import { MultisigBrokerUtils, MultisigClient } from '../../../multisigBroker'
import * as ui from '../../../ui'
import { renderUnsignedTransactionDetails, watchTransaction } from '../../../utils/transaction'

// todo(patnir): this command does not differentiate between a participant and an account.
// there is a possibility that the account and participant have different names.

type MultisigParticipant = {
  name: string
  identity: Identity
  hasSecret: boolean
}

export class SignMultisigTransactionCommand extends IronfishCommand {
  static description = 'Interactive command sign a transaction with a multisig account'

  static flags = {
    ...RemoteFlags,
    unsignedTransaction: Flags.string({
      char: 'u',
      description: 'The unsigned transaction that needs to be signed',
    }),
    account: Flags.string({
      char: 'a',
      description: 'Name of the account to use for signing the transaction',
    }),
    ledger: Flags.boolean({
      default: false,
      description: 'Perform operation with a ledger device',
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
      default: 'multisig.ironfish.network',
    }),
    port: Flags.integer({
      description: 'port to connect to on the multisig broker server',
      default: 9035,
    }),
    sessionId: Flags.string({
      description: 'Unique ID for a multisig server session to join',
    }),
    passphrase: Flags.string({
      description: 'Passphrase to join the multisig server session',
    }),
    tls: Flags.boolean({
      description: 'connect to the multisig server over TLS',
      dependsOn: ['server'],
      allowNo: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(SignMultisigTransactionCommand)
    const client = await this.connectRpc()
    await ui.checkWalletUnlocked(client)

    let ledger: LedgerMultiSigner | undefined = undefined

    if (flags.ledger) {
      ledger = new LedgerMultiSigner()
    }

    let multisigAccountName: string
    if (!flags.account) {
      multisigAccountName = await ui.accountPrompt(client)
    } else {
      multisigAccountName = flags.account
      const account = (await client.wallet.getAccounts()).content.accounts.find(
        (a) => a === multisigAccountName,
      )
      if (!account) {
        this.error(`Account ${multisigAccountName} not found`)
      }
    }

    const accountIdentities = (
      await client.wallet.multisig.getAccountIdentities({ account: multisigAccountName })
    ).content.identities
    const participants = (await client.wallet.multisig.getIdentities()).content.identities

    const matchingIdentities = participants.filter((identity) =>
      accountIdentities.includes(identity.identity),
    )

    if (matchingIdentities.length === 0) {
      this.error(`No matching identities found for account ${multisigAccountName}`)
    }

    let participant: MultisigParticipant

    if (matchingIdentities.length === 1) {
      participant = matchingIdentities[0]
    } else {
      participant = await ui.listPrompt(
        'Select identity for signing',
        matchingIdentities,
        (i) => i.name,
      )
    }

    let multisigClient: MultisigClient | null = null
    if (flags.server || flags.connection || flags.sessionId || flags.passphrase) {
      const { hostname, port, sessionId, passphrase } =
        await MultisigBrokerUtils.parseConnectionOptions({
          connection: flags.connection,
          hostname: flags.hostname,
          port: flags.port,
          sessionId: flags.sessionId,
          passphrase: flags.passphrase,
          logger: this.logger,
        })

      multisigClient = MultisigBrokerUtils.createClient(hostname, port, {
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

    const { unsignedTransaction, totalParticipants } = await this.getSigningConfig(
      multisigClient,
      flags.unsignedTransaction,
    )

    const { commitment, identities } = await ui.retryStep(
      async () => {
        return this.performCreateSigningCommitment(
          client,
          multisigClient,
          multisigAccountName,
          participant,
          totalParticipants,
          unsignedTransaction,
          ledger,
        )
      },
      this.logger,
      true,
    )

    const signingPackage = await ui.retryStep(() => {
      return this.performAggregateCommitments(
        client,
        multisigClient,
        multisigAccountName,
        commitment,
        identities,
        totalParticipants,
        unsignedTransaction,
      )
    }, this.logger)

    const signatureShare = await ui.retryStep(
      () =>
        this.performCreateSignatureShare(
          client,
          multisigAccountName,
          participant,
          signingPackage,
          unsignedTransaction,
          ledger,
        ),
      this.logger,
      true,
    )

    await ui.retryStep(
      () =>
        this.performAggregateSignatures(
          client,
          multisigClient,
          multisigAccountName,
          signingPackage,
          signatureShare,
          identities.length,
        ),
      this.logger,
    )

    this.log('Multisignature sign process completed!')
    multisigClient?.stop()
  }

  async getSigningConfig(
    multisigClient: MultisigClient | null,
    unsignedTransactionFlag?: string,
  ): Promise<{ unsignedTransaction: UnsignedTransaction; totalParticipants: number }> {
    if (multisigClient?.sessionId) {
      let totalParticipants = 0
      let unsignedTransactionHex = ''
      let waiting = true
      multisigClient.onSigningStatus.on((message) => {
        totalParticipants = message.numSigners
        unsignedTransactionHex = message.unsignedTransaction
        waiting = false
      })

      ux.action.start('Waiting for signer config from server')
      while (waiting) {
        multisigClient.getSigningStatus()
        await PromiseUtils.sleep(3000)
      }
      multisigClient.onSigningStatus.clear()
      ux.action.stop()

      const unsignedTransaction = new UnsignedTransaction(
        Buffer.from(unsignedTransactionHex, 'hex'),
      )

      return { totalParticipants, unsignedTransaction }
    }

    const unsignedTransactionInput =
      unsignedTransactionFlag ??
      (await ui.longPrompt('Enter the unsigned transaction', { required: true }))
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(unsignedTransactionInput, 'hex'),
    )

    const totalParticipants = await ui.inputNumberPrompt(
      this.logger,
      'Enter the number of participants in signing this transaction',
      { required: true, integer: true },
    )

    if (totalParticipants < 2) {
      this.error('Minimum number of participants must be at least 2')
    }

    if (multisigClient) {
      multisigClient.startSigningSession(totalParticipants, unsignedTransactionInput)
      this.log('\nStarted new signing session:')
      this.log(`${multisigClient.sessionId}`)
      this.log('\nSigning session connection string:')
      this.log(`${multisigClient.connectionString}`)
    }

    return { unsignedTransaction, totalParticipants }
  }

  private async performAggregateSignatures(
    client: RpcClient,
    multisigClient: MultisigClient | null,
    accountName: string,
    signingPackage: string,
    signatureShare: string,
    totalParticipants: number,
  ): Promise<void> {
    let signatureShares: string[] = [signatureShare]
    if (!multisigClient) {
      this.log('\n============================================')
      this.log('\nSignature Share:')
      this.log(signatureShare)
      this.log('\n============================================')

      this.log('\nShare your signature share with other participants.')

      this.log(
        `Enter ${
          totalParticipants - 1
        } signature shares of the participants (excluding your own)`,
      )

      signatureShares = await ui.collectStrings('Signature Share', totalParticipants - 1, {
        additionalStrings: [signatureShare],
        errorOnDuplicate: true,
      })
    } else {
      multisigClient.submitSignatureShare(signatureShare)

      multisigClient.onSigningStatus.on((message) => {
        signatureShares = message.signatureShares
      })

      ux.action.start('Waiting for Signature Shares from server')
      while (signatureShares.length < totalParticipants) {
        multisigClient.getSigningStatus()
        ux.action.status = `${signatureShares.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onSigningStatus.clear()
      ux.action.stop()
    }

    const broadcast = await ui.confirmPrompt('Do you want to broadcast the transaction?')
    const watch = await ui.confirmPrompt('Do you want to watch the transaction?')

    ux.action.start('Signing the multisig transaction')

    const response = await client.wallet.multisig.aggregateSignatureShares({
      account: accountName,
      broadcast,
      signingPackage,
      signatureShares,
    })

    const bytes = Buffer.from(response.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    ux.action.stop()

    if (broadcast && response.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    if (broadcast && response.content.broadcasted === false) {
      this.warn(`Transaction '${transaction.hash().toString('hex')}' failed to broadcast`)
    }

    this.log(`Transaction: ${response.content.transaction}`)
    this.log(`Hash: ${transaction.hash().toString('hex')}`)
    this.log(`Fee: ${CurrencyUtils.render(transaction.fee(), true)}`)

    if (watch) {
      this.log('')

      await watchTransaction({
        client,
        logger: this.logger,
        account: accountName,
        hash: transaction.hash().toString('hex'),
      })
    }
  }

  private async performCreateSignatureShare(
    client: RpcClient,
    accountName: string,
    identity: MultisigParticipant,
    signingPackageString: string,
    unsignedTransaction: UnsignedTransaction,
    ledger: LedgerMultiSigner | undefined,
  ): Promise<string> {
    this.debug('\n============================================')
    this.debug('\nSigning Package:')
    this.debug(signingPackageString)
    this.debug('\n============================================')

    let signatureShare: string

    const signingPackage = new multisig.SigningPackage(Buffer.from(signingPackageString, 'hex'))

    if (ledger) {
      const frostSignatureShare = await ui.ledger({
        ledger,
        message: 'Sign Transaction',
        approval: true,
        action: () =>
          ledger.dkgSign(
            unsignedTransaction,
            signingPackage.frostSigningPackage().toString('hex'),
          ),
      })

      signatureShare = multisig.SignatureShare.fromFrost(
        frostSignatureShare,
        Buffer.from(identity.identity, 'hex'),
      )
        .serialize()
        .toString('hex')
    } else {
      signatureShare = (
        await client.wallet.multisig.createSignatureShare({
          account: accountName,
          signingPackage: signingPackageString,
        })
      ).content.signatureShare
    }

    return signatureShare
  }

  private async performAggregateCommitments(
    client: RpcClient,
    multisigClient: MultisigClient | null,
    accountName: string,
    commitment: string,
    identities: string[],
    totalParticipants: number,
    unsignedTransaction: UnsignedTransaction,
  ) {
    let commitments: string[] = [commitment]
    if (!multisigClient) {
      this.log('\n============================================')
      this.log('\nCommitment:')
      this.log(commitment)
      this.log('\n============================================')

      this.log('\nShare your commitment with other participants.')

      this.log(
        `Enter ${identities.length - 1} commitments of the participants (excluding your own)`,
      )

      commitments = await ui.collectStrings('Commitment', identities.length - 1, {
        additionalStrings: [commitment],
        errorOnDuplicate: true,
      })
    } else {
      multisigClient.submitSigningCommitment(commitment)

      multisigClient.onSigningStatus.on((message) => {
        commitments = message.signingCommitments
      })

      ux.action.start('Waiting for Signing Commitments from server')
      while (commitments.length < totalParticipants) {
        multisigClient.getSigningStatus()
        ux.action.status = `${commitments.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onSigningStatus.clear()
      ux.action.stop()
    }

    const signingPackageResponse = await client.wallet.multisig.createSigningPackage({
      account: accountName,
      unsignedTransaction: unsignedTransaction.serialize().toString('hex'),
      commitments,
    })

    return signingPackageResponse.content.signingPackage
  }

  private async performCreateSigningCommitment(
    client: RpcClient,
    multisigClient: MultisigClient | null,
    accountName: string,
    participant: MultisigParticipant,
    totalParticipants: number,
    unsignedTransaction: UnsignedTransaction,
    ledger: LedgerMultiSigner | undefined,
  ) {
    let identities: string[] = [participant.identity]
    if (!multisigClient) {
      this.log(`Identity for ${participant.name}: \n${participant.identity} \n`)
      this.log('Share your participant identity with other signers.')

      this.log(
        `Enter ${totalParticipants - 1} identities of the participants (excluding your own)`,
      )

      identities = await ui.collectStrings('Participant Identity', totalParticipants - 1, {
        additionalStrings: [participant.identity],
        errorOnDuplicate: true,
      })
    } else {
      multisigClient.submitSigningIdentity(participant.identity)

      multisigClient.onSigningStatus.on((message) => {
        identities = message.identities
      })

      ux.action.start('Waiting for Identities from server')
      while (identities.length < totalParticipants) {
        multisigClient.getSigningStatus()
        ux.action.status = `${identities.length}/${totalParticipants}`
        await PromiseUtils.sleep(3000)
      }

      multisigClient.onSigningStatus.clear()
      ux.action.stop()
    }

    const unsignedTransactionHex = unsignedTransaction.serialize().toString('hex')

    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      accountName,
      this.logger,
    )

    let commitment
    if (ledger) {
      commitment = await this.createSigningCommitmentWithLedger(
        ledger,
        participant,
        unsignedTransaction,
        identities,
      )
    } else {
      commitment = (
        await client.wallet.multisig.createSigningCommitment({
          account: accountName,
          unsignedTransaction: unsignedTransactionHex,
          signers: identities.map((identity) => ({ identity })),
        })
      ).content.commitment
    }

    return {
      commitment,
      identities,
    }
  }

  async createSigningCommitmentWithLedger(
    ledger: LedgerMultiSigner,
    participant: MultisigParticipant,
    unsignedTransaction: UnsignedTransaction,
    signers: string[],
  ): Promise<string> {
    const rawCommitments = await ui.ledger({
      ledger,
      message: 'Get Commitments',
      approval: true,
      action: () => ledger.dkgGetCommitments(unsignedTransaction),
    })

    const sigingCommitment = multisig.SigningCommitment.fromRaw(
      participant.identity,
      rawCommitments,
      unsignedTransaction.hash(),
      signers,
    )

    return sigingCommitment.serialize().toString('hex')
  }
}
