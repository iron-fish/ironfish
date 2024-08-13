/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Asset } from '@ironfish/rust-nodejs'
import {
  ContractArtifact,
  CurrencyUtils,
  EthUtils,
  GLOBAL_CONTRACT_ADDRESS,
  IronfishEvm,
} from '@ironfish/sdk'
import { Flags, ux } from '@oclif/core'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { HexFlag, RemoteFlags, ValueFlag } from '../../flags'
import { selectAsset } from '../../utils/asset'
import { promptCurrency } from '../../utils/currency'

export class EvmUnshieldCommand extends IronfishCommand {
  static description = 'Unshield assets from Iron Fish to EVM-compatible chain'

  static flags = {
    ...RemoteFlags,
    account: Flags.string({
      char: 'f',
      description: 'The account to unshield from',
    }),
    amount: ValueFlag({
      char: 'a',
      description: 'The amount to unshield in the major denomination',
      flagName: 'amount',
    }),
    assetId: HexFlag({
      char: 'i',
      description: 'The identifier for the asset to unshield',
    }),
    confirmations: Flags.integer({
      char: 'c',
      description:
        'Minimum number of block confirmations needed to include a note. Set to 0 to include all blocks.',
      required: false,
    }),
    nonce: Flags.integer({
      char: 'n',
      description: 'The nonce for the unshield transaction',
      required: false,
    }),
    privateKey: Flags.string({
      char: 'p',
      description: 'The private key of the sending EVM account',
    }),
  }

  async start(): Promise<void> {
    const { flags } = await this.parse(EvmUnshieldCommand)
    let assetId = flags.assetId
    let from = flags.account
    let nonce = flags.nonce

    const client = await this.sdk.connectRpc()

    if (assetId == null) {
      const asset = await selectAsset(client, from, {
        action: 'unshield',
        showNativeAsset: true,
        showNonCreatorAsset: true,
        showSingleAssetChoice: false,
        confirmations: flags.confirmations,
      })

      assetId = asset?.id

      if (!assetId) {
        assetId = Asset.nativeId().toString('hex')
      }
    }

    const assetData = (
      await client.wallet.getAsset({
        account: from,
        id: assetId,
        confirmations: flags.confirmations,
      })
    ).content

    let amount: undefined | bigint

    if (flags.amount) {
      const [parsedAmount, error] = CurrencyUtils.tryMajorToMinor(
        flags.amount,
        assetId,
        assetData?.verification,
      )

      if (error) {
        this.error(`${error.message}`)
      }

      amount = parsedAmount
    }

    if (amount == null) {
      amount = await promptCurrency({
        client: client,
        required: true,
        text: 'Enter the amount to unshield in the major denomination',
        minimum: 1n,
        logger: this.logger,
        assetId: assetId,
        assetVerification: assetData.verification,
        balance: {
          account: from,
          confirmations: flags.confirmations,
        },
      })
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

    if (nonce === undefined) {
      const input = await ux.prompt(
        'Enter the nonce for the unshield transaction (or leave blank for auto-selection)',
        {
          required: true,
        },
      )
      if (input !== '') {
        const parsedNonce = parseInt(input, 10)
        if (isNaN(parsedNonce) || parsedNonce < 0) {
          this.error('Invalid nonce. Please enter a non-negative integer.')
        }
        nonce = parsedNonce
      }
    }

    let privateKey = flags.privateKey

    if (!privateKey) {
      const input = await ux.prompt('Enter private key of the sender account: ', {
        required: true,
      })
      privateKey = EthUtils.prefix0x(input)
    }

    const node = await this.sdk.node()
    await node.openDB()

    const evm = new IronfishEvm(node.chain.blockchainDb)
    await evm.open()

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const data = globalContract.encodeFunctionData('unshield', [BigInt(assetId), amount])

    const tx = new LegacyTransaction({
      nonce: nonce ?? 0n,
      gasLimit: BigInt(1000000),
      gasPrice: BigInt(0),
      to: GLOBAL_CONTRACT_ADDRESS,
      value: 0n,
      data: data,
    })

    // // Sign the transaction (you'll need to implement a way to get the private key)
    // const privateKey = await this.getPrivateKey(from) // Implement this method
    // const signedTx = tx.sign(privateKey)

    // // Run the transaction
    // const { events, error } = await evm.runTx({ tx: signedTx })

    // if (error) {
    //   this.error(`Unshield transaction failed: ${error.message}`)
    // }

    // Assert.isNotUndefined(events)
    // Assert.isEqual(events.length, 1)
    // const log = events[0] as EvmUnshield

    // this.log(`Unshield transaction successful`)
    // this.log(`Asset ID: ${log.assetId.toString('hex')}`)
    // this.log(`Amount: ${CurrencyUtils.encode(log.amount)}`)

    // Implement unshield functionality here
    this.log(
      `Unshield command not yet implemented. AssetId: ${assetId}, Amount: ${CurrencyUtils.encode(
        amount,
      )}, From: ${from}, Nonce: ${nonce ?? 'auto'}`,
    )
  }
}
