/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Address, isValidAddress } from '@ethereumjs/util'
import { GoldTokenJson } from '@ironfish/ironfish-contracts'
import { EthUtils, IronfishEvm } from '@ironfish/sdk'
import { Flags } from '@oclif/core'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../../command'
import { RemoteFlags } from '../../../flags'

export class EvmBalanceCommand extends IronfishCommand {
  static description = `Displays an account's unshielded balance`

  static flags = {
    ...RemoteFlags,
    address: Flags.string({
      char: 'a',
      description: 'EVM address of account to get unshielded balance for',
      required: true,
    }),
    contract: Flags.string({
      char: 'c',
      description: 'The EVM contract address of ERC20',
      required: true,
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EvmBalanceCommand)

    const { address, contract: contractAddress } = flags

    if (!isValidAddress(address)) {
      this.error('Invalid Ethereum address')
    }

    if (!isValidAddress(contractAddress)) {
      this.error('Invalid Ethereum contract address')
    }

    const node = await this.sdk.node()
    await node.openDB()

    const evm = new IronfishEvm(node.chain.blockchainDb)
    await evm.open()

    const globalContract = new ethers.Interface(GoldTokenJson.abi)
    const data = globalContract.encodeFunctionData('balanceOf', [EthUtils.prefix0x(address)])

    const result = await evm.call({
      to: Address.fromString(EthUtils.prefix0x(contractAddress)),
      data: Buffer.from(data.slice(2), 'hex'),
    })

    const coder = ethers.AbiCoder.defaultAbiCoder()
    const decoded = coder.decode(['uint256'], result.execResult.returnValue)

    this.log(`Address:      ${address}`)
    this.log(`Contract:     ${contractAddress}`)
    this.log(`Balance:      ${decoded.toString()}`)
  }
}
