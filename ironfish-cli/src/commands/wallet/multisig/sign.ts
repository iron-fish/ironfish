/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { multisig } from '@ironfish/rust-nodejs'
import { CurrencyUtils, RpcClient, Transaction, UnsignedTransaction } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'
import { LedgerMultiSigner } from '../../../ledger'
import * as ui from '../../../ui'
import {
  createSigningSessionManager,
  MultisigClientSigningSessionManager,
  SigningSessionManager,
} from '../../../utils/multisig/sessionManagers'
import { renderUnsignedTransactionDetails, watchTransaction } from '../../../utils/transaction'

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
      multisigAccountName = await ui.multisigAccountPrompt(client)
    } else {
      multisigAccountName = flags.account
      const account = (await client.wallet.getAccounts()).content.accounts.find(
        (a) => a === multisigAccountName,
      )
      if (!account) {
        this.error(`Account ${multisigAccountName} not found`)
      }
    }

    const identity = (
      await client.wallet.multisig.getAccountIdentity({ account: multisigAccountName })
    ).content.identity

    const accountIdentities = (
      await client.wallet.multisig.getAccountIdentities({ account: multisigAccountName })
    ).content.identities

    const sessionManager = createSigningSessionManager({
      logger: this.logger,
      server: flags.server,
      connection: flags.connection,
      hostname: flags.hostname,
      port: flags.port,
      passphrase: flags.passphrase,
      sessionId: flags.sessionId,
      tls: flags.tls,
    })

    const { numSigners, unsignedTransaction } = await ui.retryStep(async () => {
      return sessionManager.startSession({
        unsignedTransaction: flags.unsignedTransaction,
        identity: identity,
        allowedIdentities: accountIdentities,
      })
    }, this.logger)

    await renderUnsignedTransactionDetails(
      client,
      unsignedTransaction,
      multisigAccountName,
      this.logger,
    )

    // Prompt for confirmation before broker automates signing
    if (!flags.ledger && sessionManager instanceof MultisigClientSigningSessionManager) {
      await ui.confirmOrQuit('Sign this transaction?')
    }

    const { commitment, identities } = await ui.retryStep(
      async () => {
        return this.performCreateSigningCommitment(
          client,
          sessionManager,
          multisigAccountName,
          identity,
          numSigners,
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
        sessionManager,
        multisigAccountName,
        commitment,
        numSigners,
        unsignedTransaction,
      )
    }, this.logger)

    const signatureShare = await ui.retryStep(
      () =>
        this.performCreateSignatureShare(
          client,
          multisigAccountName,
          identity,
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
          sessionManager,
          multisigAccountName,
          signingPackage,
          signatureShare,
          identities.length,
        ),
      this.logger,
    )

    this.log('Multisignature sign process completed!')
    sessionManager.endSession()
  }

  private async performAggregateSignatures(
    client: RpcClient,
    sessionManager: SigningSessionManager,
    accountName: string,
    signingPackage: string,
    signatureShare: string,
    numSigners: number,
  ): Promise<void> {
    const signatureShares = await sessionManager.getSignatureShares({
      signatureShare,
      numSigners,
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
    identity: string,
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
        Buffer.from(identity, 'hex'),
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
    sessionManager: SigningSessionManager,
    accountName: string,
    commitment: string,
    numSigners: number,
    unsignedTransaction: UnsignedTransaction,
  ) {
    const commitments = await sessionManager.getSigningCommitments({
      signingCommitment: commitment,
      numSigners,
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
    sessionManager: SigningSessionManager,
    accountName: string,
    identity: string,
    numSigners: number,
    unsignedTransaction: UnsignedTransaction,
    ledger: LedgerMultiSigner | undefined,
  ) {
    const identities = await sessionManager.getIdentities({
      accountName,
      identity,
      numSigners,
    })

    const unsignedTransactionHex = unsignedTransaction.serialize().toString('hex')

    let commitment
    if (ledger) {
      commitment = await this.createSigningCommitmentWithLedger(
        ledger,
        identity,
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
    identity: string,
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
      identity,
      rawCommitments,
      unsignedTransaction.hash(),
      signers,
    )

    return sigingCommitment.serialize().toString('hex')
  }
}
