/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { LegacyTransaction } from '@ethereumjs/tx'
import { Account, Address } from '@ethereumjs/util'
import { Asset, generateKey } from '@ironfish/rust-nodejs'
import {
  Assert,
  ContractArtifact,
  EvmUnshield,
  GLOBAL_CONTRACT_ADDRESS,
  IronfishEvm,
} from '@ironfish/sdk'
import { ethers } from 'ethers'
import { IronfishCommand } from '../../command'
import { LocalFlags } from '../../flags'

export class UnshieldCommand extends IronfishCommand {
  static description = 'Unshield IRON from the Iron Fish network to EVM'

  static flags = { ...LocalFlags }

  async start(): Promise<void> {
    const node = await this.sdk.node()
    await node.openDB()

    const evm = new IronfishEvm(node.chain.blockchainDb)
    await evm.open()

    const senderKey = generateKey()

    const senderPrivateKey = Uint8Array.from(Buffer.from(senderKey.spendingKey, 'hex'))
    const senderAddress = Address.fromPrivateKey(senderPrivateKey)

    const senderAccount = new Account(BigInt(0), 10n)

    await node.chain.blockchainDb.stateManager.checkpoint()
    await node.chain.blockchainDb.stateManager.putAccount(senderAddress, senderAccount)
    await node.chain.blockchainDb.stateManager.commit()

    const contract = await node.chain.blockchainDb.stateManager.getAccount(
      GLOBAL_CONTRACT_ADDRESS,
    )

    if (!contract) {
      this.error('Contract creation failed')
    }

    this.log(`Contract created at: ${GLOBAL_CONTRACT_ADDRESS.toString()}`)

    const globalContract = new ethers.Interface(ContractArtifact.abi)

    const data = globalContract.encodeFunctionData('unshield_iron', [
      senderAddress.toString(),
      10n,
    ])

    const tx = new LegacyTransaction({
      nonce: 0n,
      gasLimit: 100_000n,
      to: GLOBAL_CONTRACT_ADDRESS,
      data: data,
    })

    const { events } = await evm.runTx({ tx: tx.sign(senderPrivateKey) })

    Assert.isNotUndefined(events)
    Assert.isEqual(events.length, 1)
    const log = events[0] as EvmUnshield

    this.log('Unshield Event:')
    this.log(`Asset ID: ${log.assetId.toString('hex')}`)
    this.log(`Amount: ${log.amount.toString()}`)

    const native = Asset.nativeId().toString('hex')
    Assert.isEqual(log.assetId.toString('hex'), native)
    Assert.isEqual(log.amount, 10n)

    // Assert the token ID for native asset (IRON)
    const tokenId = this.getTokenIdFromAssetId(log.assetId)
    Assert.isEqual(tokenId, 0n, 'Token ID should be 0 for native asset (IRON)')

    await node.closeDB()
  }

  private getTokenIdFromAssetId(assetId: Buffer): bigint {
    const native = Asset.nativeId()
    if (Buffer.compare(assetId, native) === 0) {
      return 0n
    }
    throw new Error('Not implemented for non-native assets')
  }
}
