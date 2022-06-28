/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  Assert,
  displayIronAmountWithCurrency,
  ironToOre,
  isValidAmount,
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

const REGISTER_URL = 'https://testnet.ironfish.network/signup'
const IRON_TO_SEND = 0.1

export default class DepositAll extends IronfishCommand {
  static description = 'Deposit $IRON for testnet points'

  client: RpcClient | null = null
  api: WebApi | null = new WebApi()

  static flags = {
    ...RemoteFlags,
    fee: Flags.integer({
      char: 'f',
      default: 1,
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

    const fee = flags.fee
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

    const { canSend, errorReason } = await this.verifyCanSend(flags, graffiti)
    if (!canSend) {
      Assert.isNotNull(errorReason)
      this.log(errorReason)
      this.exit(1)
    }

    if (!flags.confirm) {
      this.log(
        `You are about to deposit all your $IRON to the Iron Fish deposit account. The memos will contain the graffiti "${graffiti}".`,
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

  private async verifyCanSend(
    flags: Record<string, unknown>,
    graffiti: string,
  ): Promise<{ canSend: boolean; errorReason: string | null }> {
    Assert.isNotNull(this.client)
    Assert.isNotNull(this.api)

    const status = await this.client.status()
    if (!status.content.blockchain.synced) {
      return {
        canSend: false,
        errorReason: `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      }
    }

    let user
    try {
      user = await this.api.findUser({ graffiti })
    } catch (error: unknown) {
      if (error instanceof Error) {
        this.error(error.message)
      }

      return {
        canSend: false,
        errorReason: `There is a problem with the Iron Fish API. Please try again later.`,
      }
    }

    if (!user) {
      return {
        canSend: false,
        errorReason: `Graffiti not registered. Register at ${REGISTER_URL} and try again`,
      }
    }

    const expirationSequenceDelta = flags.expirationSequenceDelta as number | undefined
    if (expirationSequenceDelta !== undefined && expirationSequenceDelta < 0) {
      return {
        canSend: false,
        errorReason: `Expiration sequence delta must be non-negative`,
      }
    }

    if (expirationSequenceDelta !== undefined && expirationSequenceDelta > 120) {
      return {
        canSend: false,
        errorReason: 'Expiration sequence delta should not be above 120 blocks',
      }
    }

    const fee = flags.fee as number
    if (!isValidAmount(fee)) {
      return {
        canSend: false,
        errorReason: `The minimum fee is ${displayIronAmountWithCurrency(
          MINIMUM_IRON_AMOUNT,
          false,
        )}`,
      }
    }

    return { canSend: true, errorReason: null }
  }
}
