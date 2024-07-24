/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Asset, multisig, verifyTransactions } from '@ironfish/rust-nodejs'
import { Assert } from '../../../../assert'
import { createRouteTest } from '../../../../testUtilities/routeTest'
import { Account, ACCOUNT_SCHEMA_VERSION, AssertMultisigSigner } from '../../../../wallet'
import { AccountImport } from '../../../../wallet/exporter'

function shuffleArray<T>(array: Array<T>): Array<T> {
  // Durstenfeld shuffle (https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle#The_modern_algorithm)
  const shuffledArray = [...array]
  for (let i = shuffledArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffledArray[i], shuffledArray[j]] = [shuffledArray[j], shuffledArray[i]]
  }
  return shuffledArray
}

describe('multisig RPC integration', () => {
  const routeTest = createRouteTest()

  describe('with TDK', () => {
    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 2 signers (minumum: 2, maximum: 3)', async () => {
      return runTest({
        setupMethod: setupWithTrustedDealer,
        numSigners: 2,
        minSigners: 2,
        numParticipants: 3,
      })
    }, 100000)

    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 5 signers (minumum: 3, maximum: 8)', async () => {
      return runTest({
        setupMethod: setupWithTrustedDealer,
        numSigners: 5,
        minSigners: 3,
        numParticipants: 8,
      })
    }, 100000)

    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 3 signers (minumum: 3, maximum: 3)', () => {
      return runTest({
        setupMethod: setupWithTrustedDealer,
        numSigners: 3,
        minSigners: 3,
        numParticipants: 3,
      })
    }, 100000)
  })

  describe('with DKG', () => {
    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 2 signers (minumum: 2, maximum: 3)', async () => {
      return runTest({
        setupMethod: setupWithDistributedKeyGen,
        numSigners: 2,
        minSigners: 2,
        numParticipants: 3,
      })
    }, 100000)

    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 2 signers (minumum: 2, maximum: 3), no-std fixtures', async () => {
      return runTest({
        setupMethod: setupWithDistributedKeyGenNoStd,
        numSigners: 2,
        minSigners: 2,
        numParticipants: 3,
      })
    }, 100000)

    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 5 signers (minumum: 3, maximum: 8)', async () => {
      return runTest({
        setupMethod: setupWithDistributedKeyGen,
        numSigners: 5,
        minSigners: 3,
        numParticipants: 8,
      })
    }, 100000)

    // eslint-disable-next-line jest/expect-expect
    it('should create a verified transaction using 3 signers (minumum: 3, maximum: 3)', () => {
      return runTest({
        setupMethod: setupWithDistributedKeyGen,
        numSigners: 3,
        minSigners: 3,
        numParticipants: 3,
      })
    }, 100000)
  })

  async function runTest(options: {
    numParticipants: number
    minSigners: number
    numSigners: number
    setupMethod: (options: {
      participants: Array<{ name: string; identity: string }>
      minSigners: number
    }) => Promise<{ participantAccounts: Array<Account>; coordinatorAccount: Account }>
  }): Promise<void> {
    const { numParticipants, minSigners, numSigners, setupMethod } = options
    const accountNames = Array.from(
      { length: numParticipants },
      (_, index) => `test-account-${index}`,
    )
    const participants = await createParticipants(accountNames)
    const { participantAccounts, coordinatorAccount } = await setupMethod({
      participants,
      minSigners,
    })
    return createTransaction({ participantAccounts, coordinatorAccount, numSigners })
  }

  function createParticipants(
    participantNames: Array<string>,
  ): Promise<Array<{ name: string; identity: string }>> {
    return Promise.all(
      participantNames.map(async (name) => {
        const identity = (await routeTest.client.wallet.multisig.createParticipant({ name }))
          .content.identity
        return { name, identity }
      }),
    )
  }

  async function setupWithTrustedDealer(options: {
    participants: Array<{ name: string; identity: string }>
    minSigners: number
  }): Promise<{ participantAccounts: Array<Account>; coordinatorAccount: Account }> {
    const { participants, minSigners } = options

    // create the trusted dealer packages
    const trustedDealerPackage = (
      await routeTest.client.wallet.multisig.createTrustedDealerKeyPackage({
        minSigners,
        participants,
      })
    ).content

    // import the accounts generated by the trusted dealer
    const participantAccounts: Account[] = []
    for (const { name, identity } of participants) {
      const importAccount = trustedDealerPackage.participantAccounts.find(
        (account) => account.identity === identity,
      )
      Assert.isNotUndefined(importAccount)
      await routeTest.client.wallet.importAccount({
        name,
        account: importAccount.account,
        rescan: false,
      })

      const participantAccount = routeTest.wallet.getAccountByName(name)
      Assert.isNotNull(participantAccount)
      participantAccounts.push(participantAccount)
    }

    const account: AccountImport = {
      version: ACCOUNT_SCHEMA_VERSION,
      name: 'coordinator',
      spendingKey: null,
      createdAt: null,
      multisigKeys: {
        publicKeyPackage: trustedDealerPackage.publicKeyPackage,
      },
      ...trustedDealerPackage,
    }

    // import an account to serve as the coordinator
    await routeTest.client.wallet.importAccount({
      account: JSON.stringify(account),
      rescan: false,
    })

    const coordinatorAccount = routeTest.wallet.getAccountByName('coordinator')
    Assert.isNotNull(coordinatorAccount)

    return { participantAccounts, coordinatorAccount }
  }

  async function setupWithDistributedKeyGen(options: {
    participants: Array<{ name: string; identity: string }>
    minSigners: number
  }): Promise<{ participantAccounts: Array<Account>; coordinatorAccount: Account }> {
    const { participants, minSigners } = options

    // perform dkg round 1
    const round1Packages = await Promise.all(
      participants.map(({ name }) =>
        routeTest.client.wallet.multisig.dkg.round1({
          participantName: name,
          minSigners,
          participants,
        }),
      ),
    )

    // perform dkg round 2
    const round2Packages = await Promise.all(
      participants.map(({ name }, index) =>
        routeTest.client.wallet.multisig.dkg.round2({
          participantName: name,
          round1SecretPackage: round1Packages[index].content.round1SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
        }),
      ),
    )

    // perform dkg round 3
    const participantAccounts = await Promise.all(
      participants.map(async ({ name }, index) => {
        await routeTest.client.wallet.multisig.dkg.round3({
          participantName: name,
          round2SecretPackage: round2Packages[index].content.round2SecretPackage,
          round1PublicPackages: round1Packages.map((pkg) => pkg.content.round1PublicPackage),
          round2PublicPackages: round2Packages.map((pkg) => pkg.content.round2PublicPackage),
        })

        const participantAccount = routeTest.wallet.getAccountByName(name)
        Assert.isNotNull(participantAccount)
        return participantAccount
      }),
    )

    const viewOnlyAccount = (
      await routeTest.client.wallet.exportAccount({
        account: participants[0].name,
        viewOnly: true,
      })
    ).content.account
    Assert.isNotNull(viewOnlyAccount)
    await routeTest.client.wallet.importAccount({
      name: 'coordinator',
      account: viewOnlyAccount,
      rescan: false,
    })

    const coordinatorAccount = routeTest.wallet.getAccountByName('coordinator')
    Assert.isNotNull(coordinatorAccount)

    return { participantAccounts, coordinatorAccount }
  }

  async function setupWithDistributedKeyGenNoStd(): Promise<{
    participantAccounts: Array<Account>
    coordinatorAccount: Account
  }> {
    // Sets up test with ironfish-frost (no-std) derived fixtures
    const secret1Str =
      '727d1e1d5078330c3235534168334cc3f9d109aef910be9b10a1772c987a3de9ae2398587781de038493a7f8bb42cc0a1c0d608ddd23898f763bd4d1115d53d641'
    const secret2Str =
      '72520b51392c0917314319882e5b4a55f6c2a37461ba1f76e0b6e8e1386534a809ee574570d70882849b5653cb7089fd333192181dc1550f28a1725e931ae21530'
    const secret3Str =
      '72d55118e79c33c042a22f0f71070250ae637cc2654241572c92ab260a2602d4286029ce39296e96c5433951103e82becf3b1f5219aeb3e46e1688bef51cc099d3'
    const keyPackage1 =
      '00c3d2051e681a54df987a571364b071cfa2f0065a5999779042ef50e2b033af4a8ab5970cad371b36afd26e4a323f3f4977c0c5c5c6a4685854251dae07df2f3628ef24018ef03cd55b8113c0a202b07440a3e5d6b526e31aaea6c09d6e2df0958cced4588de220e9da7cb5509034f6f8b8c17cb4895ec7da38738e343ccbb291ebb907e502'

    const keyPackage2 =
      '00c3d2051edbe8399eb105d6455412c6c42cff9f903f003dd74fb3d6938b8b2f50431d9404ff71b230e5f99d9682ab403b062912c8f12d37c03069102a2f7ba814b2564609ecbeac123df15471d76fb263be502ac496682a9f83316591d20289e907878b478de220e9da7cb5509034f6f8b8c17cb4895ec7da38738e343ccbb291ebb907e502'

    const keyPackage3 =
      '00c3d2051ea9331e86e03b1d8ce2d1a262436d0c6b6edd02781529a573992e3d6cc2ec8a00b70391f3af698e4fe3139ae9ea059ef9be8ad1ca4f2eef4f81241e82be17310880c477a2e8d06d909afa5bcdb605aceadcdb232ffd469c121d88109e3929f0a98de220e9da7cb5509034f6f8b8c17cb4895ec7da38738e343ccbb291ebb907e502'

    const publicKeyPackage =
      'e600000000c3d2051e03a9331e86e03b1d8ce2d1a262436d0c6b6edd02781529a573992e3d6cc2ec8a0080c477a2e8d06d909afa5bcdb605aceadcdb232ffd469c121d88109e3929f0a9dbe8399eb105d6455412c6c42cff9f903f003dd74fb3d6938b8b2f50431d9404ecbeac123df15471d76fb263be502ac496682a9f83316591d20289e907878b47681a54df987a571364b071cfa2f0065a5999779042ef50e2b033af4a8ab5970c8ef03cd55b8113c0a202b07440a3e5d6b526e31aaea6c09d6e2df0958cced4588de220e9da7cb5509034f6f8b8c17cb4895ec7da38738e343ccbb291ebb907e50300000072a5280a4b0a18b9fd467bdd1965a65140b09e9a0b2a01c9041da55875b3671aed649490780a2605cb9135fdfff830db7becc8bba79c40aee164259e912d69d1325a09e6a0d1a799c8eebfeb6df1a5bc872ccd5e382a2c71bfc351056108b262a69719b6dcda628a83846a0736fc6323a3971388e62cd0a0458b230dae8a363c067241aae8878bfff50a5123c4e9618554b5cd75365f496c9d0bd18add2e2ff38af893af89a2057608205ac22d039945334af51aab4377ccd877deb59220bd1a857cefbbb455c79f0c00947441ba3920f2c8103923f3e154d431d1ff012261cbf0cc75194bd55ea9d2d129e1016da1fe89065d6b0ce482ff21e4f40d401880ca730e72e5f48e28cc1546027126c8e84f77b6843e592dd6e56fefff122758618408afff00677794df9947b7d97deca16c48e62cf8fff3fef677daa2398330f3f5d76d06e1224c782caeef102f6f4fe91fbe2176b1010ad2a0d4423b6fccbe29e2787b1d8a882abd2251c5867b0f6f02f1fbc91f3a75936526d695b87a5097fe50bd380b0200'
    const groupSecretKey = 'f77b275ed7a78714dc0c48dc5d499f7e2b413e2e294a5b186de0705556125d18'

    // get secret buffer from test in no-std, add them here
    const secret1 = new multisig.ParticipantSecret(Buffer.from(secret1Str, 'hex'))
    const identity1 = secret1.toIdentity().serialize()
    const secret2 = new multisig.ParticipantSecret(Buffer.from(secret2Str, 'hex'))
    const identity2 = secret2.toIdentity().serialize()
    const secret3 = new multisig.ParticipantSecret(Buffer.from(secret3Str, 'hex'))
    const identity3 = secret3.toIdentity().serialize()

    await routeTest.wallet.walletDb.putMultisigSecret(identity1, {
      name: 'foo',
      secret: secret1.serialize(),
    })
    await routeTest.wallet.walletDb.putMultisigSecret(identity2, {
      name: 'bar',
      secret: secret2.serialize(),
    })
    await routeTest.wallet.walletDb.putMultisigSecret(identity3, {
      name: 'baz',
      secret: secret3.serialize(),
    })

    const participants = [
      {
        name: 'foo',
        secret: secret1,
        identity: identity1.toString('hex'),
        keyPackage: keyPackage1,
      },
      {
        name: 'bar',
        secret: secret2,
        identity: secret2.toIdentity().serialize().toString('hex'),
        keyPackage: keyPackage2,
      },
      {
        name: 'baz',
        secret: secret3,
        identity: secret3.toIdentity().serialize().toString('hex'),
        keyPackage: keyPackage3,
      },
    ]

    const participantAccounts: Account[] = []

    for (const participant of participants) {
      const {
        publicAddress,
        keyPackage,
        // TODO verify public key pacakge here is same as output from ironfish-frost no-std
        viewKey,
        incomingViewKey,
        outgoingViewKey,
        proofAuthorizingKey,
      } = multisig.deriveAccountKeysNodejs(
        participant.keyPackage,
        publicKeyPackage,
        groupSecretKey,
      )

      const accountImport = {
        name: participant.name,
        version: ACCOUNT_SCHEMA_VERSION,
        createdAt: null,
        spendingKey: null,
        viewKey,
        incomingViewKey,
        outgoingViewKey,
        publicAddress,
        proofAuthorizingKey,
        multisigKeys: {
          identity: participant.identity,
          keyPackage,
          publicKeyPackage,
        },
      }

      const account = await routeTest.wallet.importAccount(accountImport)
      participantAccounts.push(account)
      await routeTest.wallet.skipRescan(account)
    }
    const viewOnlyAccount = (
      await routeTest.client.wallet.exportAccount({
        account: participants[0].name,
        viewOnly: true,
      })
    ).content.account
    Assert.isNotNull(viewOnlyAccount)
    await routeTest.client.wallet.importAccount({
      name: 'coordinator',
      account: viewOnlyAccount,
      rescan: false,
    })

    const coordinatorAccount = routeTest.wallet.getAccountByName('coordinator')
    Assert.isNotNull(coordinatorAccount)

    return { participantAccounts, coordinatorAccount }
  }

  async function createTransaction(options: {
    participantAccounts: Array<Account>
    coordinatorAccount: Account
    numSigners: number
  }) {
    const { participantAccounts, coordinatorAccount, numSigners } = options

    // select `numSigners` random accounts to sign
    const signerAccounts = shuffleArray(participantAccounts).slice(0, numSigners)

    // fund coordinator account
    // mine block to send IRON to multisig account
    const miner = await routeTest.wallet.createAccount('miner')
    await fundAccount(coordinatorAccount, miner)

    // build list of signers
    const signers = signerAccounts.map((participant) => {
      AssertMultisigSigner(participant)
      const secret = new multisig.ParticipantSecret(
        Buffer.from(participant.multisigKeys.secret, 'hex'),
      )
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
    for (const participantAccount of signerAccounts) {
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
    for (const participantAccount of signerAccounts) {
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
  }

  async function fundAccount(account: Account, miner: Account): Promise<void> {
    Assert.isNotNull(miner.spendingKey)
    await routeTest.wallet.scan()

    const minersfee = await routeTest.chain.createMinersFee(
      0n,
      routeTest.chain.head.sequence + 1,
      miner.spendingKey,
    )
    const newBlock = await routeTest.chain.newBlock([], minersfee)
    const addResult = await routeTest.chain.addBlock(newBlock)
    expect(addResult.isAdded).toBeTruthy()

    await routeTest.wallet.scan()

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

    await routeTest.wallet.scan()
  }
})
