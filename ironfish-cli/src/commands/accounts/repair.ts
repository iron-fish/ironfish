/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Account,
  Assert,
  Blockchain,
  CurrencyUtils,
  NodeUtils,
  Wallet,
  WalletDB,
} from '@ironfish/sdk'
import { BufferMap } from 'buffer-map'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

const RESCAN_MESSAGE = 'Account must be rescanned using `accounts:rescan --reset`.'
export default class Repair extends IronfishCommand {
  static hidden = false

  static description = `Repairs wallet database stores`

  static flags = {
    ...LocalFlags,
  }

  static args = [
    {
      name: 'account',
      parse: (input: string): Promise<string> => Promise.resolve(input.trim()),
      required: false,
      description: 'Name of the account to repair the database for',
    },
  ]

  async start(): Promise<void> {
    const { args } = await this.parse(Repair)

    const node = await this.sdk.node()
    await NodeUtils.waitForOpen(node)

    const account = this.loadAccount(node.wallet, args.account)

    this.log(`Repairing wallet for account ${account.name}`)

    this.log('Repairing nullifierToNote')
    await this.repairNullifierToNoteHash(account, node.wallet.walletDb)

    this.log('Repairing expired transactions')
    await this.repairTransactions(account, node.wallet.walletDb, node.chain)

    this.log('Repairing balance')
    await this.repairBalance(account, node.wallet.walletDb, node.chain)

    this.log('Repairing sequenceToNoteHash')
    await this.repairSequenceToNoteHash(account, node.wallet.walletDb)
  }

  private loadAccount(wallet: Wallet, accountName: string | undefined): Account {
    if (accountName) {
      const account = wallet.getAccountByName(accountName)
      if (account) {
        return account
      }
      throw new Error(`No account with name ${accountName}`)
    }

    const defaultAccount = wallet.getDefaultAccount()
    if (defaultAccount) {
      return defaultAccount
    }

    throw new Error('Could not find an account to repair.')
  }

  private async repairTransactions(
    account: Account,
    walletDb: WalletDB,
    chain: Blockchain,
  ): Promise<void> {
    let unexpiredTransactions = 0

    for await (const transactionValue of account.getTransactions()) {
      const expirationSequence = transactionValue.transaction.expirationSequence()
      const transactionHash = transactionValue.transaction.hash()

      const isExpired =
        !transactionValue.sequence &&
        chain.verifier.isExpiredSequence(expirationSequence, chain.head.sequence)

      const pendingTransactionHash = await walletDb.pendingTransactionHashes.get([
        account.prefix,
        [expirationSequence, transactionHash],
      ])

      if (isExpired && !pendingTransactionHash) {
        unexpiredTransactions++

        await account.expireTransaction(transactionValue.transaction)
      }
    }

    this.log(
      `\tRepaired ${unexpiredTransactions} expired transactions stuck in unexpired state.`,
    )
  }

  private async repairBalance(
    account: Account,
    walletDb: WalletDB,
    chain: Blockchain,
  ): Promise<void> {
    const unconfirmedBalances = new BufferMap<bigint>()

    let noteUnspentMismatches = 0

    for await (const decryptedNoteValue of account.getNotes()) {
      const transactionValue = await account.getTransaction(decryptedNoteValue.transactionHash)

      Assert.isNotUndefined(
        transactionValue,
        `Account has a note but is missing the transaction that it received the note from. ${RESCAN_MESSAGE}`,
      )

      if (!decryptedNoteValue.nullifier) {
        if (transactionValue.sequence) {
          throw new Error(
            `Transaction marked as on chain, but note missing nullifier. ${RESCAN_MESSAGE}`,
          )
        }

        continue
      }

      const spent = await chain.nullifiers.contains(decryptedNoteValue.nullifier)

      if (spent && !decryptedNoteValue.spent) {
        noteUnspentMismatches++

        await walletDb.saveDecryptedNote(account, decryptedNoteValue.hash, {
          ...decryptedNoteValue,
          spent: true,
        })
      } else if (!spent) {
        const isExpired =
          !transactionValue.sequence &&
          chain.verifier.isExpiredSequence(
            transactionValue.transaction.expirationSequence(),
            chain.head.sequence,
          )

        if (decryptedNoteValue.spent) {
          await walletDb.saveDecryptedNote(account, decryptedNoteValue.hash, {
            ...decryptedNoteValue,
            spent: false,
          })
        }

        if (!isExpired) {
          const assetIdentifier = decryptedNoteValue.note.assetIdentifier()
          const unconfirmedBalance = unconfirmedBalances.get(assetIdentifier) ?? BigInt(0)
          unconfirmedBalances.set(
            assetIdentifier,
            unconfirmedBalance + decryptedNoteValue.note.value(),
          )
        }
      }
    }

    for (const [assetIdentifier, unconfirmedBalance] of unconfirmedBalances.entries()) {
      this.log(
        `\tSaving new unconfirmed balance for ${assetIdentifier.toString(
          'hex',
        )}: ${CurrencyUtils.renderIron(unconfirmedBalance)}`,
      )
      await walletDb.saveUnconfirmedBalance(account, assetIdentifier, unconfirmedBalance)
    }

    this.log(
      `\tRepaired ${noteUnspentMismatches} decrypted notes incorrectly marked as unspent`,
    )
  }

  private async repairNullifierToNoteHash(account: Account, walletDb: WalletDB): Promise<void> {
    let missingNotes = 0

    for await (const [[, nullifier], noteHash] of walletDb.nullifierToNoteHash.getAllIter(
      undefined,
      account.prefixRange,
    )) {
      const decryptedNoteValue = await account.getDecryptedNote(noteHash)

      if (!decryptedNoteValue || !decryptedNoteValue.nullifier) {
        missingNotes++

        await walletDb.deleteNullifier(account, nullifier)
      }
    }

    this.log(
      `\tRepaired ${missingNotes} nullifiers that map to notes that are not in the wallet`,
    )
  }

  private async repairSequenceToNoteHash(account: Account, walletDb: WalletDB): Promise<void> {
    let incorrectSequences = 0

    for await (const [, [sequence, noteHash]] of walletDb.sequenceToNoteHash.getAllKeysIter(
      undefined,
      account.prefixRange,
    )) {
      const decryptedNoteValue = await account.getDecryptedNote(noteHash)

      if (!decryptedNoteValue) {
        incorrectSequences++

        await walletDb.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]])

        continue
      }

      const transactionValue = await account.getTransaction(decryptedNoteValue.transactionHash)

      Assert.isNotUndefined(
        transactionValue,
        `Account has a note but is missing the transaction that it received the note from. ${RESCAN_MESSAGE}`,
      )

      if (transactionValue.sequence !== sequence) {
        incorrectSequences++

        await walletDb.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]])

        await walletDb.setNoteHashSequence(account, noteHash, transactionValue.sequence)
      }
    }

    this.log(`\tRepaired ${incorrectSequences} incorrect sequenceToNoteHash mappings`)
  }
}
