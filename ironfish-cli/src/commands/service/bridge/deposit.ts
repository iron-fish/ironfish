/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import { CurrencyUtils, SendTransactionRequest } from '@ironfish/sdk'
import { CliUx, Flags } from '@oclif/core'
import { isAddress } from 'web3-validator'
import { IronfishCommand } from '../../../command'
import { IronFlag, RemoteFlags } from '../../../flags'
import { promptCurrency } from '../../../utils/currency'

const DEFAULT_BRIDGE_ADDRESS =
  '1d1a1fb9fafd7de32c7f02115207d6fe9df1272f5b4bedbbfa1330eba88c5ce2'

export class Deposit extends IronfishCommand {
  static description = `Deposit coins to the bridge`

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to deposit from',
    }),
    to: Flags.string({
      char: 't',
      description: 'The public address of the bridge account',
      default: DEFAULT_BRIDGE_ADDRESS,
    }),
    amount: IronFlag({
      char: 'a',
      description: 'Amount to deposit',
      flagName: 'amount',
    }),
    fee: IronFlag({
      char: 'o',
      description: 'The fee amount in IRON',
      minimum: 1n,
      flagName: 'fee',
    }),
    confirm: Flags.boolean({
      default: false,
      description: 'Confirm without asking',
    }),
    expiration: Flags.integer({
      char: 'x',
      description:
        'The block sequence after which the transaction will be removed from the mempool. Set to 0 for no expiration.',
    }),
    confirmations: Flags.integer({
      char: 'c',
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
      required: false,
    }),
    dest: Flags.string({
      description: 'ETH public address to deposit to',
      parse: (input: string): Promise<string> => {
        return new Promise((resolve, reject) => {
          if (isAddress(input)) {
            if (input.startsWith('0x')) {
              resolve(input.slice(2))
            } else {
              resolve(input)
            }
          }

          reject(Error(`${input} is not a valid ETH address`))
        })
      },
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(Deposit)

    const client = await this.sdk.connectRpc()

    const publicKey = (await client.wallet.getAccountPublicKey({ account: flags.account }))
      .content.publicKey

    const account =
      flags.account ?? (await client.wallet.getDefaultAccount()).content.account?.name

    const assetId = Asset.nativeId().toString('hex')

    let dest = flags.dest
    if (!dest) {
      while (!dest) {
        dest = await CliUx.ux.prompt(
          'Enter an ETH address to send WIRON to on Sepolia testnet',
          {
            required: true,
          },
        )

        if (!isAddress(dest)) {
          this.log(`${dest} is not a valid ETH address`)
          dest = undefined
          continue
        }

        if (dest.startsWith('0x')) {
          dest = dest.slice(2)
        }
      }
    }

    let amount = flags.amount
    if (amount == null) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount',
        minimum: 1n,
        logger: this.logger,
        balance: {
          account,
          confirmations: flags.confirmations,
          assetId,
        },
      })
    }

    let fee = flags.fee
    if (!fee) {
      fee = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the transaction fee in $IRON',
        minimum: 1n,
        default: '0.00000001',
        logger: this.logger,
      })
    }

    const memo = this.encodeEthAddress(dest)

    const params: SendTransactionRequest = {
      account,
      outputs: [
        {
          publicAddress: flags.to,
          amount: CurrencyUtils.encode(amount),
          memo,
          assetId,
        },
      ],
      fee: CurrencyUtils.encode(fee),
      expiration: flags.expiration,
      confirmations: flags.confirmations,
    }

    this.log(
      `\nDeposit transaction:\n` +
        `From address:      ${publicKey}\n` +
        `To bridge address: ${flags.to}\n` +
        `To ETH address:    ${dest}\n` +
        `Amount:            ${amount}\n` +
        `Transaction fee:   ${fee}`,
    )

    if (!flags.confirm && !(await CliUx.ux.confirm('\nConfirm deposit [Y/N]'))) {
      this.error('Deposit aborted.')
    }

    CliUx.ux.action.start('Sending deposit transaction')

    const sendResponse = await client.wallet.sendTransaction(params)

    CliUx.ux.action.stop()

    this.log(`Deposit transaction hash: ${sendResponse.content.hash}`)
  }

  encodeEthAddress(address: string): string {
    return Buffer.from(address, 'hex').toString('base64')
  }
}
