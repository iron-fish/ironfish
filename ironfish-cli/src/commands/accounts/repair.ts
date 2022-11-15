/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Account,
  Assert,
  Blockchain,
  BufferUtils,
  CurrencyUtils,
  NodeUtils,
  Wallet,
  WalletDB,
} from '@ironfish/sdk'
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

    this.log('Repairing decryptedNotes and balance')
    await this.repairDecryptedNotes(account, node.wallet.walletDb, node.chain)

    this.log('Repairing nullifierToNote')
    await this.repairNullifierToNoteHash(account, node.wallet.walletDb)

    this.log('Repairing sequenceToNoteHash')
    await this.repairSequenceToNoteHash(account, node.wallet.walletDb, node.chain)
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

  private async repairDecryptedNotes(
    account: Account,
    walletDb: WalletDB,
    chain: Blockchain,
  ): Promise<void> {
    let unconfirmedBalance = 0n

    let noteUnspentMismatches = 0
    let nullifierNoteHashMismatches = 0

    await walletDb.db.transaction(async (tx) => {
      for await (const decryptedNoteValue of account.getNotes()) {
        const transactionValue = await account.getTransaction(
          decryptedNoteValue.transactionHash,
          tx,
        )

        Assert.isNotUndefined(
          transactionValue,
          `Account has a note but is missing the transaction that it received the note from. ${RESCAN_MESSAGE}`,
        )

        const transactionOnMain = await this.verifyBlockContainsTransaction(
          decryptedNoteValue.transactionHash,
          transactionValue.blockHash,
          chain,
        )

        const noteOnMain = !!(await chain.notes.leavesIndex.get(decryptedNoteValue.hash, tx))

        if (noteOnMain && !transactionOnMain) {
          throw new Error(`Note is in chain database, but transaction is not on chain. ${RESCAN_MESSAGE}`)
        } else if (!noteOnMain && transactionOnMain) {
          throw new Error('Chain database is corrupt. Run `chain:repair` before starting your node.')
        }

        await walletDb.setNoteHashSequence(
          account,
          decryptedNoteValue.hash,
          transactionValue.sequence,
          tx,
        )

        if (!decryptedNoteValue.nullifier) {
          if (transactionValue.sequence) {
            throw new Error(`Transaction marked as on chain, but note missing nullifier. ${RESCAN_MESSAGE}`)
          }

          continue
        }

        const spent = await chain.nullifiers.contains(decryptedNoteValue.nullifier)

        if (spent && !decryptedNoteValue.spent) {
          noteUnspentMismatches++

          await walletDb.saveDecryptedNote(
            account,
            decryptedNoteValue.hash,
            {
              ...decryptedNoteValue,
              spent,
            },
            tx,
          )
        } else if (!spent) {
          unconfirmedBalance += decryptedNoteValue.note.value()
        }

        const nullifierNoteHash = await account.getNoteHash(decryptedNoteValue.nullifier)

        if (!nullifierNoteHash || !nullifierNoteHash.equals(decryptedNoteValue.hash)) {
          nullifierNoteHashMismatches++

          await walletDb.saveNullifierNoteHash(
            account,
            decryptedNoteValue.nullifier,
            decryptedNoteValue.hash,
            tx,
          )
        }
      }

      this.log(
        `\tSaving new unconfirmed balance: ${CurrencyUtils.renderIron(
          unconfirmedBalance,
          true,
        )}`,
      )
      await walletDb.saveUnconfirmedBalance(account, unconfirmedBalance, tx)
    })

    this.log(
      `\tRepaired ${noteUnspentMismatches} decrypted notes incorrectly marked as unspent`,
    )
    this.log(
      `\tRepaired ${nullifierNoteHashMismatches} nullifiers mapped to an incorrect note hash`,
    )
  }

  private async repairNullifierToNoteHash(account: Account, walletDb: WalletDB): Promise<void> {
    let missingNotes = 0
    let nullifierNoteHashMismatches = 0

    await walletDb.db.transaction(async (tx) => {
      for await (const [[, nullifier], noteHash] of walletDb.nullifierToNoteHash.getAllIter(
        tx,
        account.prefixRange,
      )) {
        const decryptedNoteValue = await account.getDecryptedNote(noteHash, tx)

        if (!decryptedNoteValue) {
          missingNotes++

          await walletDb.deleteNullifier(account, nullifier, tx)
        } else if (!BufferUtils.equalsNullable(nullifier, decryptedNoteValue.nullifier)) {
          nullifierNoteHashMismatches++

          await walletDb.deleteNullifier(account, nullifier, tx)
        }
      }
    })

    this.log(
      `\tRepaired ${missingNotes} nullifiers that map to notes that are not in the wallet`,
    )
    this.log(
      `\tRepaired ${nullifierNoteHashMismatches} nullifiers that map to notes that are not on chain`,
    )
  }

  private async repairSequenceToNoteHash(
    account: Account,
    walletDb: WalletDB,
    chain: Blockchain,
  ): Promise<void> {
    let sequenceMismatches = 0
    let missingNotes = 0

    await walletDb.db.transaction(async (tx) => {
      for await (const [, [sequence, noteHash]] of walletDb.sequenceToNoteHash.getAllKeysIter(
        tx,
        account.prefixRange,
      )) {
        const decryptedNoteValue = await account.getDecryptedNote(noteHash)

        if (!decryptedNoteValue) {
          missingNotes++

          await walletDb.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]], tx)
        } else {
          const transactionValue = await account.getTransaction(
            decryptedNoteValue.transactionHash,
          )

          Assert.isNotUndefined(
            transactionValue,
            `Account has a note but is missing the transaction that it received the note from. ${RESCAN_MESSAGE}`,
          )

          await this.verifyBlockContainsTransaction(
            decryptedNoteValue.transactionHash,
            transactionValue.blockHash,
            chain,
          )

          if (transactionValue.sequence !== sequence) {
            sequenceMismatches++

            await walletDb.sequenceToNoteHash.del([account.prefix, [sequence, noteHash]], tx)

            await walletDb.setNoteHashSequence(account, noteHash, transactionValue.sequence, tx)
          }
        }
      }
    })

    this.log(`\tRepaired ${missingNotes} sequenceToNoteHash mappings with missing notes`)
    this.log(
      `\tRepaired ${sequenceMismatches} sequenceToNoteHash mappings with incorrect sequences`,
    )
  }

  async verifyBlockContainsTransaction(
    transactionHash: Buffer,
    blockHash: Buffer | null,
    chain: Blockchain,
  ): Promise<boolean> {
    if (!blockHash) {
      return false
    }

    const block = await chain.getBlock(blockHash)

    if (!block) {
      throw new Error(`Transaction marked as on chain, but missing from block. ${RESCAN_MESSAGE}`)
    }

    for (const transaction of block.transactions) {
      if (transaction.hash().equals(transactionHash)) {
        const mainBlock = await chain.getHeaderAtSequence(block.header.sequence)

        return mainBlock !== null && mainBlock.hash.equals(block.header.hash)
      }
    }

    throw new Error(`Transaction marked as on chain, but missing from block. ${RESCAN_MESSAGE}`)
  }
}
