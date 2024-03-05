/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, ParticipantSecret, verifyTransactions } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../assert'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { Account, ACCOUNT_SCHEMA_VERSION, AssertMultisigSigner } from '../../../../wallet'

describe('multisig RPC integration', () => {
  const routeTest = createRouteTest()

  it('should create a verified transaction using multisig', async () => {
    // create a bunch of multisig identities
    const accountNames = Array.from({ length: 3 }, (_, index) => `test-account-${index}`)
    const participants = await Promise.all(
      accountNames.map(async (name) => {
        const identity = (await routeTest.client.wallet.multisig.createParticipant({ name }))
          .content.identity
        return { name, identity }
      }),
    )

    // initialize the group though tdk and import the accounts generated
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners: 2,
        participants,
      })
    ).content
    for (const { name, identity } of participants) {
      const importAccount = trustedDealerPackage.participantAccounts.find(
        (account) => account.identity === identity,
      )
      Assert.isNotUndefined(importAccount)
      await routeTest.client.wallet.importAccount({
        name,
        account: importAccount.account,
      })
    }

    const participantAccounts = accountNames.map((accountName) => {
      const participantAccount = routeTest.wallet.getAccountByName(accountName)
      Assert.isNotNull(participantAccount)
      return participantAccount
    })

    // import an account to serve as the coordinator
    await routeTest.client.wallet.importAccount({
      account: {
        version: ACCOUNT_SCHEMA_VERSION,
        name: 'coordinator',
        spendingKey: null,
        createdAt: null,
        multisigKeys: {
          publicKeyPackage: trustedDealerPackage.publicKeyPackage,
        },
        ...trustedDealerPackage,
      },
      rescan: false,
    })
    const coordinatorAccount = routeTest.wallet.getAccountByName('coordinator')
    Assert.isNotNull(coordinatorAccount)

    // fund coordinator account
    // mine block to send IRON to multisig account
    const miner = await routeTest.wallet.createAccount('miner')
    await fundAccount(coordinatorAccount, miner)

    // build list of signers
    const signers = participantAccounts.map((participant) => {
      AssertMultisigSigner(participant)
      const secret = new ParticipantSecret(Buffer.from(participant.multisigKeys.secret, 'hex'))
      return { identity: secret.toIdentity().serialize().toString('hex') }
    })

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
    const commitments: Array<string> = []
    for (const participantAccount of participantAccounts) {
      AssertMultisigSigner(participantAccount)

      const commitmentResponse = await routeTest.client.wallet.multisig.createSigningCommitment(
        {
          account: participantAccount.name,
          unsignedTransaction,
          signers,
        },
      )

      commitments.push(commitmentResponse.content.commitment)
    }

    // create signing package
    const responseSigningPackage = await routeTest.client.wallet.multisig.createSigningPackage({
      commitments,
      unsignedTransaction,
    })
    const signingPackage = responseSigningPackage.content.signingPackage

    // create and collect signing shares
    const signatureShares: Array<string> = []
    for (const participantAccount of participantAccounts) {
      AssertMultisigSigner(participantAccount)

      const signatureShareResponse =
        await routeTest.client.wallet.multisig.createSignatureShare({
          account: participantAccount.name,
          signingPackage,
        })

      signatureShares.push(signatureShareResponse.content.signatureShare)
    }

    // aggregate signing shares
    const aggregateResponse = await routeTest.client.wallet.multisig.aggregateSignatureShares({
      account: coordinatorAccount.name,
      signingPackage,
      signatureShares,
    })
    expect(aggregateResponse.status).toEqual(200)

    const verified = verifyTransactions([
      Buffer.from(aggregateResponse.content.transaction, 'hex'),
    ])
    expect(verified).toBe(true)
  }, 100000)

  async function fundAccount(account: Account, miner: Account): Promise<void> {
    Assert.isNotNull(miner.spendingKey)
    await routeTest.wallet.updateHead()

    const minersfee = await routeTest.chain.createMinersFee(
      0n,
      routeTest.chain.head.sequence + 1,
      miner.spendingKey,
    )
    const newBlock = await routeTest.chain.newBlock([], minersfee)
    const addResult = await routeTest.chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await routeTest.wallet.updateHead()

    const transaction = await routeTest.wallet.send({
      account: miner,
      outputs: [
        {
          publicAddress: account.publicAddress,
          amount: BigInt(2),
          memo: Buffer.from(''),
          assetId: Asset.nativeId(),
        },
      ],
      fee: BigInt(0),
    })

    // Create a block with a miner's fee and the transaction to send IRON to the multisig account
    const minersfee2 = await routeTest.chain.createMinersFee(
      transaction.fee(),
      newBlock.header.sequence + 1,
      miner.spendingKey,
    )
    const newBlock2 = await routeTest.chain.newBlock([transaction], minersfee2)
    const addResult2 = await routeTest.chain.addBlock(newBlock2)
    expect(addResult2.isAdded).toBeTruthy()

    await routeTest.wallet.updateHead()
  }
})
