/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  Asset,
  IdentifierCommitment,
  ParticipantSecret,
  verifyTransactions,
} from '@ironfish/rust-nodejs'
import { Assert } from '../../../assert'
import { useAccountFixture, useMinerBlockFixture } from '../../../testUtilities'
import { createRouteTest } from '../../../testUtilities/routeTest'
import { Account } from '../../../wallet'

describe('multisig RPC integration', () => {
  const routeTest = createRouteTest()

  it('should create a verified transaction using multisig', async () => {
    // TODO: remove seed after implementing deterministic nonces
    const seed = 420

    // create participants
    const participants = Array.from({ length: 3 }, () => ({
      identifier: ParticipantSecret.random().toIdentity().toFrostIdentifier(),
    }))

    // create trusted dealer key package
    const responseKeyPackage = await routeTest.client.multisig.createTrustedDealerKeyPackage({
      minSigners: 2,
      maxSigners: 3,
      participants,
    })
    const trustedDealerPackage = responseKeyPackage.content

    // import coordinator account
    await routeTest.client.wallet.importAccount({
      account: {
        version: 4,
        name: 'coordinator',
        spendingKey: null,
        createdAt: null,
        multiSigKeys: {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        ...trustedDealerPackage,
      },
    })
    const coordinatorAccount = routeTest.wallet.getAccountByName('coordinator')
    Assert.isNotNull(coordinatorAccount)

    // fund coordinator account
    // mine block to send IRON to multisig account
    const miner = await useAccountFixture(routeTest.wallet, 'miner')
    await fundAccount(coordinatorAccount, miner)

    // create raw transaction
    const createTransactionResponse = await routeTest.client.wallet.createTransaction({
      account: coordinatorAccount.name,
      outputs: [
        {
          publicAddress: miner.publicAddress,
          amount: '1',
          memo: 'return 1 ORE',
        },
      ],
    })
    const rawTransaction = createTransactionResponse.content.transaction

    // build raw transaction into unsigned transaction
    const buildTransactionResponse = await routeTest.client.wallet.buildTransaction({
      account: coordinatorAccount.name,
      rawTransaction,
    })
    const unsignedTransaction = buildTransactionResponse.content.unsignedTransaction

    // create and collect signing commitments
    const commitments: Array<IdentifierCommitment> = []
    for (let i = 0; i < 3; i++) {
      const commitmentResponse = await routeTest.client.multisig.createSigningCommitment({
        keyPackage: trustedDealerPackage.keyPackages[i].keyPackage,
        seed,
      })

      commitments.push({
        identifier: trustedDealerPackage.keyPackages[i].identifier,
        commitment: commitmentResponse.content,
      })
    }

    // create signing package
    const responseSigningPackage = await routeTest.client.multisig.createSigningPackage({
      commitments,
      unsignedTransaction,
    })
    const signingPackage = responseSigningPackage.content.signingPackage

    // create and collect signing shares
    const signingShares: Array<{ identifier: string; signingShare: string }> = []
    for (let i = 0; i < participants.length; i++) {
      const signingShareResponse = await routeTest.client.multisig.createSigningShare({
        signingPackage,
        keyPackage: trustedDealerPackage.keyPackages[i].keyPackage,
        unsignedTransaction,
        seed,
      })

      signingShares.push({
        identifier: trustedDealerPackage.keyPackages[i].identifier,
        signingShare: signingShareResponse.content.signingShare,
      })
    }

    // aggregate signing shares
    const aggregateResponse = await routeTest.client.multisig.aggregateSigningShares({
      publicKeyPackage: trustedDealerPackage.publicKeyPackage,
      unsignedTransaction,
      signingPackage,
      signingShares,
    })
    expect(aggregateResponse.status).toEqual(200)

    const verified = verifyTransactions([
      Buffer.from(aggregateResponse.content.transaction, 'hex'),
    ])
    expect(verified).toBe(true)
  }, 100000)

  async function fundAccount(account: Account, miner: Account): Promise<void> {
    const block = await useMinerBlockFixture(routeTest.chain, undefined, miner)
    await expect(routeTest.chain).toAddBlock(block)
    await routeTest.wallet.updateHead()

    const transaction = await routeTest.wallet.send({
      account: miner,
      outputs: [
        {
          publicAddress: account.publicAddress,
          amount: BigInt(2),
          memo: '',
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
    })

    Assert.isNotNull(miner.spendingKey)

    // Create a block with a miner's fee and the transaction to send IRON to the multisig account
    const minersfee2 = await routeTest.chain.createMinersFee(
      transaction.fee(),
      block.header.sequence + 1,
      miner.spendingKey,
    )
    const newBlock2 = await routeTest.chain.newBlock([transaction], minersfee2)
    const addResult2 = await routeTest.chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    await routeTest.wallet.updateHead()
  }
})
