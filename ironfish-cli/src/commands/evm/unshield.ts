/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isValidAddress } from '@ethereumjs/util'
import { GoldTokenJson } from '@ironfish/ironfish-contracts'
import {
  ContractArtifact,
  EthSendTransactionRequest,
  EthUtils,
  GLOBAL_CONTRACT_ADDRESS,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { promptCurrency } from '../../utils/currency'

export class UnshieldCommand extends IronfishCommand {
  static description = `Unshield private asset to public token`

  static flags = {
    ...LocalFlags,
    amount: Flags.integer({
      char: 'a',
      description: 'The amount to send in the minor denomination',
    }),
    contractAddress: Flags.string({
      char: 'c',
      description: 'The EVM contract address of the asset to unshield',
    }),
    nonce: Flags.integer({
      char: 'n',
      description: 'The nonce of the EVM transaction',
    }),
    to: Flags.string({
      char: 't',
      description: 'The Ethereum public address of the recipient',
    }),
    from: Flags.string({
      char: 'f',
      description: 'The account name of the sender',
    }),
  }

  async start(): Promise<void> {
    const client = await this.sdk.connectRpc()

    const { flags } = await this.parse(UnshieldCommand)

    const { nonce } = flags

    let { amount, contractAddress, to, from } = flags

    const status = await client.wallet.getNodeStatus()

    if (!status.content.blockchain.synced) {
      this.error(
        `Your node must be synced with the Iron Fish network to send a transaction. Please try again later`,
      )
    }

    if (!from) {
      const response = await client.wallet.getDefaultAccount()

      if (!response.content.account) {
        this.error(
          `No account is currently active.
           Use ironfish wallet:create <name> to first create an account`,
        )
      }

      from = response.content.account.name
    }

    if (!to) {
      to = await ux.prompt('Enter the public address of the recipient', {
        required: true,
      })
    }

    if (!isValidAddress(to)) {
      this.error('Invalid Ethereum address')
    }

    if (!amount) {
      amount = Number(
        await promptCurrency({
          client: client,
          required: true,
          text: 'Enter the amount of the token you want to shield',
          minimum: 1n,
          logger: this.logger,
        }),
      )
    }

    if (!contractAddress) {
      contractAddress = GLOBAL_CONTRACT_ADDRESS.toString()
    }

    const isIron = contractAddress === GLOBAL_CONTRACT_ADDRESS.toString()

    const response = await client.wallet.getAccountPublicKey({ account: from })

    const publicAddress = response.content.evmPublicAddress
    if (!publicAddress) {
      this.error(`Account ${from} does not have an EVM public address`)
    }

    let data: string
    if (isIron) {
      const globalContract = new ethers.Interface(ContractArtifact.abi)
      data = globalContract.encodeFunctionData('unshield_iron', [EthUtils.prefix0x(to), amount])
    } else {
      const contract = new ethers.Interface(GoldTokenJson.abi)
      data = contract.encodeFunctionData('unshield', [amount])
    }

    const txDetails: EthSendTransactionRequest = [
      {
        nonce: nonce ? String(nonce) : undefined,
        to: contractAddress,
        from: publicAddress,
        value: '0',
        gas: String(1000000),
        gasPrice: String(0),
        data,
      },
    ]

    const hash = await client.eth.sendTransaction(txDetails)
    this.log('Transaction hash:', hash.content.result)
  }
}
