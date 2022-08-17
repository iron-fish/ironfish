/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  displayIronAmountWithCurrency,
  ironToOre,
  MINIMUM_IRON_AMOUNT,
  oreToIron,
  PromiseUtils,
  RpcClient,
  SendTransactionResponse,
  WebApi,
} from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import blessed from 'blessed'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'
import { verifyCanSend } from '../utils/currency'

const REGISTER_URL = 'https://testnet.ironfish.network/signup'
const IRON_TO_SEND = 0.1

export default class DepositAll extends IronfishCommand {
  static aliases = ['depositAll']
  static description = 'Deposit $IRON for testnet points'

  client: RpcClient | null = null
  api: WebApi | null = new WebApi()

  static flags = {
    ...RemoteFlags,
    fee: Flags.integer({
      char: 'f',
      description: `the fee amount in ORE, minimum of 1. 1 ORE is equal to ${MINIMUM_IRON_AMOUNT} IRON`,
    }),
    expirationSequenceDelta: Flags.integer({
      char: 'e',
      description: 'max number of blocks for the transaction to wait before expiring',
    }),
    account: Flags.string({
      char: 'a',
      parse: (input) => Promise.resolve(input.trim()),
      description: 'the account to send money from',
    }),
    terminate: Flags.boolean({
      default: false,
      description: 'terminate if balance is below minimum transaction requirement',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'confirm without asking',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(DepositAll)

    this.client = await this.sdk.connectRpc()
    this.api = new WebApi()

    let fee = flags.fee

    if (fee == null || Number.isNaN(fee)) {
      try {
        // fees p25 of last 100 blocks
        fee = (await this.client.getFees({ numOfBlocks: 100 })).content.p25
      } catch {
        fee = 1
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
      const feeInIron = oreToIron(fee)
      const displayFee = displayIronAmountWithCurrency(feeInIron, true)

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
    let confirmedBalance = Number(balanceResp.content.confirmed)
    let unconfirmedBalance = Number(balanceResp.content.unconfirmed)

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
      top: 1,
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
        `Balance: Confirmed - ${displayIronAmountWithCurrency(
          oreToIron(Number(confirmedBalance)),
          false,
        )}, Unconfirmed - ${displayIronAmountWithCurrency(
          oreToIron(Number(unconfirmedBalance)),
          false,
        )}`,
      )

      screen.append(footer)
      screen.render()
    }, 1000)

    // eslint-disable-next-line no-constant-condition
    while (true) {
      balanceResp = await this.client.getAccountBalance({ account: accountName })
      confirmedBalance = Number(balanceResp.content.confirmed)
      unconfirmedBalance = Number(balanceResp.content.unconfirmed)

      // terminate condition
      if (terminate && unconfirmedBalance < ironToOre(IRON_TO_SEND) + fee) {
        screen.destroy()
        process.exit(0)
      }

      // send transaction
      if (confirmedBalance > ironToOre(IRON_TO_SEND) + fee) {
        try {
          const result = await this.client.sendTransaction({
            fromAccountName: accountName,
            receives: [
              {
                publicAddress: bankDepositAddress,
                amount: ironToOre(IRON_TO_SEND).toString(),
                memo: graffiti,
              },
            ],
            fee: fee.toString(),
            expirationSequenceDelta: expirationSequenceDelta,
          })

          const transaction = result.content
          txs.push(transaction)
        } catch (error: unknown) {
          screen.destroy()
          process.exit(2)
        }
      }

      // wait 30 seconds for next transaction
      await PromiseUtils.sleep(30000)
    }
  }
}
