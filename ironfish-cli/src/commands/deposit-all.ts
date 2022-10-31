/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  BigIntUtils,
  CurrencyUtils,
  ERROR_CODES,
  MINIMUM_IRON_AMOUNT,
  PromiseUtils,
  RpcClient,
  RpcRequestError,
  SendTransactionResponse,
  WebApi,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'
import { verifyCanSend } from '../utils/currency'

const REGISTER_URL = 'https://testnet.ironfish.network/signup'

export default class DepositAll extends IronfishCommand {
  static aliases = ['depositAll']
  static description = 'Deposit $IRON for testnet points'

  client: RpcClient | null = null
  api: WebApi | null = new WebApi()

  static flags = {
    ...RemoteFlags,
    fee: Flags.string({
      char: 'f',
      description: `The fee amount in ORE, minimum of 1. 1 ORE is equal to ${MINIMUM_IRON_AMOUNT} IRON`,
    }),
    expirationSequenceDelta: Flags.integer({
      char: 'e',
      description: 'Max number of blocks for the transaction to wait before expiring',
    }),
    account: Flags.string({
      char: 'a',
      parse: (input) => Promise.resolve(input.trim()),
      description: 'The account to send money from',
    }),
    terminate: Flags.boolean({
      default: false,
      description: 'Terminate if balance is below minimum transaction requirement',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DepositAll)

    this.client = await this.sdk.connectRpc(false, true)
    this.api = new WebApi()

    let fee = null

    if (flags.fee) {
      const [parsedFee] = BigIntUtils.tryParse(flags.fee)

      if (parsedFee != null) {
        fee = parsedFee
      }
    }

    if (fee == null) {
      try {
        // fees p25 of last 100 blocks
        const feeString = (await this.client.getFees({ numOfBlocks: 100 })).content.p25
        fee = CurrencyUtils.decode(feeString)
      } catch {
        fee = 1n
      }
    }

    const terminate = flags.terminate
    const expirationSequenceDelta = flags.expirationSequenceDelta

    const accountName =
      flags.account || (await this.client.getDefaultAccount()).content.account?.name

    if (!accountName) {
      this.log(
        'Error fetching account name. Please use --account or make sure your default account is set properly.',
      )
      this.exit(1)
    }
    Assert.isNotUndefined(accountName)

    const bankDepositAddress = await this.api.getDepositAddress()

    if (!bankDepositAddress) {
      this.log('Error fetching deposit address. Please try again later.')
      this.exit(1)
    }

    const graffiti = (await this.client.getConfig({ name: 'blockGraffiti' })).content
      .blockGraffiti

    if (!graffiti) {
      this.log(
        `No graffiti found. Register at ${REGISTER_URL} then run \`ironfish testnet\` to configure your graffiti`,
      )
      this.exit(1)
    }
    Assert.isNotUndefined(graffiti)
    Assert.isNotNull(this.client)
    Assert.isNotNull(this.api)

    const { canSend, errorReason } = await verifyCanSend(
      this.client,
      this.api,
      expirationSequenceDelta,
      fee,
      graffiti,
    )
    if (!canSend) {
      Assert.isNotNull(errorReason)
      this.log(errorReason)
      this.exit(1)
    }

    if (!flags.confirm) {
      const displayFee = CurrencyUtils.renderIron(fee, true)

      this.log(
        `You are about to deposit all your $IRON to the Iron Fish deposit account. Each transaction will use a fee of ${displayFee}. The memos will contain the graffiti "${graffiti}".`,
      )

      const confirm = await CliUx.ux.confirm('Do you confirm (Y/N)?')
      if (!confirm) {
        this.log('Transaction aborted.')
        this.exit(0)
      }
    }

    this.log('Fetching account balance...')

    let balanceResp = await this.client.getAccountBalance({ account: accountName })
    let confirmedBalance = CurrencyUtils.decode(balanceResp.content.confirmed)
    let unconfirmedBalance = CurrencyUtils.decode(balanceResp.content.unconfirmed)
    let pendingBalance = CurrencyUtils.decode(balanceResp.content.pending)

    // Console log will create display issues with Blessed
    this.logger.pauseLogs()

    const screen = blessed.screen({ smartCSR: true })
    const text = blessed.text()
    screen.append(text)

    screen.key('q', () => {
      screen.destroy()
      process.exit(0)
    })

    const status = blessed.text({
      parent: screen,
      content: 'STATUS:',
    })

    const list = blessed.textbox({
      top: 4,
      alwaysScroll: true,
      scrollable: true,
      parent: screen,
    })

    const footer = blessed.text({
      bottom: 0,
      content: 'Press Q to quit',
    })

    const txs: SendTransactionResponse[] = []

    setInterval(() => {
      status.clearBaseLine(0)
      list.clearBaseLine(0)
      list.setContent(`\n--- Completed Transactions (${txs.length}) ---\n`)

      for (const transaction of txs) {
        list.pushLine(`${transaction.hash}`)
      }

      status.setContent(
        `Balance\nConfirmed:   ${CurrencyUtils.renderIron(
          confirmedBalance,
          true,
        )}\nUnconfirmed: ${CurrencyUtils.renderIron(
          unconfirmedBalance,
          true,
        )}\nPending:     ${CurrencyUtils.renderIron(pendingBalance, true)}`,
      )

      screen.append(footer)
      screen.render()
    }, 1000)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      balanceResp = await this.client.getAccountBalance({ account: accountName })
      confirmedBalance = CurrencyUtils.decode(balanceResp.content.confirmed)
      unconfirmedBalance = CurrencyUtils.decode(balanceResp.content.unconfirmed)
      pendingBalance = CurrencyUtils.decode(balanceResp.content.pending)
      // putting this inside of loop to protect against future config changes to allowable size
      const { minDepositSize, maxDepositSize } = await this.api.getMinAndMaxDepositSize()
      const minDepositOre = CurrencyUtils.decodeIron(minDepositSize)
      const maxDepositOre = CurrencyUtils.decodeIron(maxDepositSize)
      const sendableOre = confirmedBalance - fee

      // terminate condition
      if (terminate && pendingBalance < sendableOre + fee) {
        screen.destroy()
        process.exit(0)
      }

      // send transaction
      if (confirmedBalance >= sendableOre + fee) {
        try {
          const oreToSend = BigIntUtils.min(
            (sendableOre / minDepositOre) * minDepositOre,
            maxDepositOre,
          )
          const result = await this.client.sendTransaction({
            fromAccountName: accountName,
            receives: [
              {
                publicAddress: bankDepositAddress,
                amount: CurrencyUtils.encode(oreToSend),
                memo: graffiti,
              },
            ],
            fee: CurrencyUtils.encode(fee),
            expirationSequenceDelta: expirationSequenceDelta,
          })

          const transaction = result.content
          txs.push(transaction)
        } catch (error) {
          if (
            error instanceof RpcRequestError &&
            error.code === ERROR_CODES.INSUFFICIENT_BALANCE
          ) {
            // Our balance changed while trying to create a payout, ignore this error
            await PromiseUtils.sleep(30000)
            continue
          }

          screen.destroy()
          throw error
        }
      }

      // wait 30 seconds for next transaction
      await PromiseUtils.sleep(30000)
    }
  }
}
