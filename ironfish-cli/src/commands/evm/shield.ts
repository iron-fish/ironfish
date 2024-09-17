/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { GoldTokenJson } from '@ironfish/ironfish-contracts'
import { ContractArtifact, EthUtils, GLOBAL_CONTRACT_ADDRESS } from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'
import { promptCurrency } from '../../utils/currency'

export class ShieldCommand extends IronfishCommand {
  static description = `Shield token from EVM to private asset`

  static flags = {
    ...LocalFlags,
    amount: Flags.integer({
      char: 'a',
      description: 'The amount of the asset to shield',
    }),
    contractAddress: Flags.string({
      char: 'c',
      description: 'The EVM contract address of the asset to shield',
    }),
    nonce: Flags.integer({
      char: 'n',
      description: 'The nonce of the EVM transaction',
    }),
    to: Flags.string({
      char: 't',
      description: 'The Ironfish public address of the recipient',
    }),
    from: Flags.string({
      char: 'f',
      description: 'The account name of the sender',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(ShieldCommand)
    const { nonce } = flags
    let { amount, contractAddress, to, from } = flags
    const client = await this.sdk.connectRpc()

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

    if (!to) {
      const input = await ux.prompt('Enter recipient address: ', {
        required: true,
      })
      to = input
    }

    if (!from) {
      const defaultAccount = await client.wallet.getDefaultAccount()
      from = defaultAccount.content.account?.name
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
      data = globalContract.encodeFunctionData('shield_iron', [EthUtils.prefix0x(to)])
    } else {
      const contract = new ethers.Interface(GoldTokenJson.abi)
      data = contract.encodeFunctionData('shield', [EthUtils.prefix0x(to), amount])
    }
    // TODO: should we unhardcode gas limit and gas price?
    const hash = await client.eth.sendTransaction([
      {
        to: contractAddress,
        from: publicAddress,
        value: isIron ? String(amount) : undefined,
        nonce: nonce ? String(nonce) : undefined,
        gas: String(1000000),
        gasPrice: String(0),
        data,
      },
    ])
    this.log('Transaction hash:', hash.content.result)
  }
}
