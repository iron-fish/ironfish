/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { multisig } from '@ironfish/rust-nodejs'
import {
  CurrencyUtils,
  Identity,
  RpcClient,
  Transaction,
  UnsignedTransaction,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import * as ui from '../../../ui'
import { LedgerDkg } from '../../../utils/ledger'
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
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(SignMultisigTransactionCommand)
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

    const unsignedTransactionInput =
      flags.unsignedTransaction ??
      (await ui.longPrompt('Enter the unsigned transaction', { required: true }))
    const unsignedTransaction = new UnsignedTransaction(
      Buffer.from(unsignedTransactionInput, 'hex'),
    )
    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      multisigAccountName,
      this.logger,
    )

    const { commitment, identities } = await ui.retryStep(
      async () => {
        return this.performCreateSigningCommitment(
          client,
          multisigAccountName,
          participant,
          unsignedTransaction,
          unsignedTransactionInput,
          ledger,
        )
      },
      this.logger,
      true,
    )

    this.log('\n============================================')
    this.log('\nCommitment:')
    this.log(commitment)
    this.log('\n============================================')

    this.log('\nShare your commitment with other participants.')

    const signingPackage = await ui.retryStep(() => {
      return this.performAggregateCommitments(
        client,
        multisigAccountName,
        commitment,
        identities,
        unsignedTransaction,
      )
    }, this.logger)

    this.log('\n============================================')
    this.log('\nSigning Package:')
    this.log(signingPackage)
    this.log('\n============================================')

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

    this.log('\n============================================')
    this.log('\nSignature Share:')
    this.log(signatureShare)
    this.log('\n============================================')

    this.log('\nShare your signature share with other participants.')

    await ui.retryStep(
      () =>
        this.performAggregateSignatures(
          client,
          multisigAccountName,
          signingPackage,
          signatureShare,
          identities.length,
        ),
      this.logger,
    )

    this.log('Mutlisignature sign process completed!')
  }

  private async performAggregateSignatures(
    client: RpcClient,
    accountName: string,
    signingPackage: string,
    signatureShare: string,
    totalParticipants: number,
  ): Promise<void> {
    this.log(
      `Enter ${
        totalParticipants - 1
      } signature shares of the participants (excluding your own)`,
    )

    const signatureShares = await ui.collectStrings('Signature Share', totalParticipants - 1, {
      additionalStrings: [signatureShare],
      errorOnDuplicate: true,
    })

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
    ledger: LedgerDkg | undefined,
  ): Promise<string> {
    let signatureShare: string

    const signingPackage = new multisig.SigningPackage(Buffer.from(signingPackageString, 'hex'))

    if (ledger) {
      const frostSignatureShare = await ledger.dkgSign(
        unsignedTransaction.publicKeyRandomness(),
        signingPackage.frostSigningPackage().toString('hex'),
        unsignedTransaction.hash().toString('hex'),
      )

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
    accountName: string,
    commitment: string,
    identities: string[],
    unsignedTransaction: UnsignedTransaction,
  ) {
    this.log(
      `Enter ${identities.length - 1} commitments of the participants (excluding your own)`,
    )

    const commitments = await ui.collectStrings('Commitment', identities.length - 1, {
      additionalStrings: [commitment],
      errorOnDuplicate: true,
    })

    const signingPackageResponse = await client.wallet.multisig.createSigningPackage({
      account: accountName,
      unsignedTransaction: unsignedTransaction.serialize().toString('hex'),
      commitments,
    })

    return signingPackageResponse.content.signingPackage
  }

  private async performCreateSigningCommitment(
    client: RpcClient,
    accountName: string,
    participant: MultisigParticipant,
    unsignedTransaction: UnsignedTransaction,
    unsignedTransactionInput: string,
    ledger: LedgerDkg | undefined,
  ) {
    const input = await ui.inputPrompt(
      'Enter the number of participants in signing this transaction',
      true,
    )
    const totalParticipants = parseInt(input)

    if (totalParticipants < 2) {
      this.error('Minimum number of participants must be at least 2')
    }

    this.log(
      `Enter ${totalParticipants - 1} identities of the participants (excluding your own)`,
    )

    const identities = await ui.collectStrings('Identity', totalParticipants - 1, {
      additionalStrings: [participant.identity],
      errorOnDuplicate: true,
    })

    let commitment

    if (ledger) {
      await ledger.reviewTransaction(unsignedTransaction.serialize().toString('hex'))

      commitment = await this.createSigningCommitmentWithLedger(
        ledger,
        participant,
        unsignedTransaction.hash(),
        identities,
      )
    } else {
      commitment = (
        await client.wallet.multisig.createSigningCommitment({
          account: accountName,
          unsignedTransaction: unsignedTransactionInput,
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
    ledger: LedgerDkg,
    participant: MultisigParticipant,
    transactionHash: Buffer,
    signers: string[],
  ): Promise<string> {
    const rawCommitments = await ledger.dkgGetCommitments(transactionHash.toString('hex'))

    const sigingCommitment = multisig.SigningCommitment.fromRaw(
      participant.identity,
      rawCommitments,
      transactionHash,
      signers,
    )

    return sigingCommitment.serialize().toString('hex')
  }
}
