/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset } from '@ironfish/rust-nodejs'
import {
  CreateTransactionRequest,
  RawTransactionSerde,
  TESTNET,
  Transaction,
} from '@ironfish/sdk'
import { CliUx } from '@oclif/core'
import axios from 'axios'
import { IronfishCommand } from '../command'
import { RemoteFlags } from '../flags'
import { promptCurrency } from '../utils/currency'
import { getExplorer } from '../utils/explorer'
import { selectFee } from '../utils/fees'
import { displayTransactionSummary } from '../utils/transaction'

export class BridgeCommand extends IronfishCommand {
  static description = `Get fee distribution for most recent blocks`

  static flags = {
    ...RemoteFlags,
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()

    const response = await client.wallet.getDefaultAccount()

    const networkId = (await client.chain.getNetworkInfo()).content.networkId

    if (networkId !== TESTNET.id) {
      CliUx.ux.error('This command is only available on testnet')
    }

    if (!response.content.account) {
      this.error(
        `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
      )
    }

    const from = response.content.account.name

    const assetId = Asset.nativeId().toString('hex')
    const assetData = (
      await client.wallet.getAsset({
        account: from,
        id: assetId,
      })
    ).content

    const amount = await promptCurrency({
      client: client,
      required: true,
      text: 'Enter the amount in the major denomination',
      minimum: 1n,
      logger: this.logger,
      assetId: assetId,
      assetVerification: assetData.verification,
      balance: {
        account: from,
      },
    })

    const to = await CliUx.ux.prompt('Enter the public address of the recipient', {
      required: true,
    })

    const url = `https://preprod-api.chainport.io/ironfish/metadata?raw_amount=${amount.toString()}&asset_id=${assetId}&target_network_id=2&target_web3_address=${to}`
    const outputs = await axios.get(url)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    outputs.data.outputs[1].amount = outputs.data.outputs[1].amount.toString()

    const params: CreateTransactionRequest = {
      account: from,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      outputs: outputs.data.outputs,
      expiration: 0,
      fee: null,
      feeRate: null,
    }

    const raw = await selectFee({
      client,
      transaction: params,
      logger: this.logger,
    })

    // sum output amounts
    const totalAmount = params.outputs.reduce((acc, output) => acc + BigInt(output.amount), 0n)

    displayTransactionSummary(
      raw,
      assetData,
      totalAmount,
      from,
      '3be494deb669ff8d943463bb6042eabcf0c5346cf444d569e07204487716cb85',
      'bridge',
    )

    const confirmed = await CliUx.ux.confirm('Do you confirm (Y/N)?')
    if (!confirmed) {
      this.error('Transaction aborted.')
    }

    const postTransaction = await client.wallet.postTransaction({
      transaction: RawTransactionSerde.serialize(raw).toString('hex'),
      account: from,
    })

    const bytes = Buffer.from(postTransaction.content.transaction, 'hex')
    const transaction = new Transaction(bytes)

    if (postTransaction.content.accepted === false) {
      this.warn(
        `Transaction '${transaction.hash().toString('hex')}' was not accepted into the mempool`,
      )
    }

    const transactionUrl = getExplorer(networkId)?.getTransactionUrl(
      transaction.hash().toString('hex'),
    )

    if (transactionUrl) {
      this.log(`\nIf the transaction is mined, it will appear here: ${transactionUrl}`)
    }
  }
}
