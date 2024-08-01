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
    it('should create a verified transaction using 2 signers (minumum: 2, maximum: 2), no-std fixtures', async () => {
      return runTest({
        setupMethod: setupWithDistributedKeyGenNoStd,
        numSigners: 2,
        minSigners: 2,
        numParticipants: 2,
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
    // get secret buffer from test in no-std, add them here
    const secret1 = new multisig.ParticipantSecret(
      Buffer.from([
        114, 212, 49, 241, 224, 201, 214, 96, 253, 234, 196, 147, 16, 114, 64, 136, 14, 2, 90,
        15, 25, 9, 3, 204, 180, 100, 93, 128, 55, 72, 83, 138, 132, 93, 107, 169, 248, 45, 217,
        4, 165, 189, 213, 110, 191, 122, 46, 228, 85, 87, 32, 88, 66, 53, 100, 178, 99, 132,
        135, 21, 12, 41, 126, 96, 182,
      ]),
    )
    const identity1 = secret1.toIdentity().serialize()
    const secret2 = new multisig.ParticipantSecret(
      Buffer.from([
        114, 187, 249, 168, 103, 43, 108, 7, 116, 175, 15, 108, 192, 94, 149, 21, 188, 205, 118,
        159, 21, 30, 237, 55, 89, 87, 67, 19, 216, 245, 75, 28, 206, 194, 46, 238, 191, 228,
        106, 4, 35, 56, 22, 45, 68, 223, 105, 67, 100, 22, 123, 28, 36, 76, 75, 193, 35, 111, 2,
        223, 227, 135, 119, 124, 242,
      ]),
    )
    const identity2 = secret2.toIdentity().serialize()

    await routeTest.wallet.walletDb.putMultisigSecret(identity1, {
      name: 'foo',
      secret: secret1.serialize(),
    })
    await routeTest.wallet.walletDb.putMultisigSecret(identity2, {
      name: 'bar',
      secret: secret2.serialize(),
    })

    const keyPackage1Arr = [
      0, 195, 210, 5, 30, 99, 168, 19, 242, 71, 221, 114, 243, 99, 212, 38, 154, 26, 198, 46,
      157, 67, 64, 135, 182, 39, 53, 65, 117, 110, 185, 166, 194, 134, 72, 244, 13, 231, 25,
      117, 166, 191, 147, 222, 124, 122, 37, 252, 36, 99, 135, 59, 184, 245, 183, 32, 239, 112,
      110, 213, 184, 152, 105, 194, 17, 43, 204, 164, 3, 194, 189, 72, 150, 6, 150, 78, 206,
      212, 47, 61, 187, 116, 105, 220, 22, 189, 64, 12, 36, 51, 37, 212, 145, 94, 116, 178, 209,
      50, 133, 31, 39, 17, 128, 79, 237, 148, 83, 205, 216, 213, 111, 138, 69, 4, 64, 4, 136,
      25, 226, 46, 132, 67, 234, 250, 46, 21, 167, 104, 37, 67, 177, 25, 149, 2,
    ]

    const keyPackage2Arr = [
      0, 195, 210, 5, 30, 59, 31, 213, 23, 149, 125, 60, 209, 164, 248, 25, 225, 146, 147, 224,
      41, 205, 145, 80, 250, 61, 36, 110, 31, 146, 86, 106, 136, 186, 236, 127, 7, 218, 197,
      205, 58, 109, 37, 21, 147, 130, 27, 108, 10, 43, 4, 236, 223, 85, 69, 45, 48, 206, 79,
      216, 200, 181, 79, 122, 49, 173, 49, 12, 14, 71, 236, 30, 106, 38, 202, 99, 224, 198, 7,
      13, 42, 158, 133, 30, 25, 189, 12, 157, 205, 106, 9, 59, 153, 235, 203, 99, 242, 230, 100,
      2, 228, 17, 128, 79, 237, 148, 83, 205, 216, 213, 111, 138, 69, 4, 64, 4, 136, 25, 226,
      46, 132, 67, 234, 250, 46, 21, 167, 104, 37, 67, 177, 25, 149, 2,
    ]

    const publicKeyPackageArr = [
      166, 0, 0, 0, 0, 195, 210, 5, 30, 2, 59, 31, 213, 23, 149, 125, 60, 209, 164, 248, 25,
      225, 146, 147, 224, 41, 205, 145, 80, 250, 61, 36, 110, 31, 146, 86, 106, 136, 186, 236,
      127, 7, 71, 236, 30, 106, 38, 202, 99, 224, 198, 7, 13, 42, 158, 133, 30, 25, 189, 12,
      157, 205, 106, 9, 59, 153, 235, 203, 99, 242, 230, 100, 2, 228, 99, 168, 19, 242, 71, 221,
      114, 243, 99, 212, 38, 154, 26, 198, 46, 157, 67, 64, 135, 182, 39, 53, 65, 117, 110, 185,
      166, 194, 134, 72, 244, 13, 194, 189, 72, 150, 6, 150, 78, 206, 212, 47, 61, 187, 116,
      105, 220, 22, 189, 64, 12, 36, 51, 37, 212, 145, 94, 116, 178, 209, 50, 133, 31, 39, 17,
      128, 79, 237, 148, 83, 205, 216, 213, 111, 138, 69, 4, 64, 4, 136, 25, 226, 46, 132, 67,
      234, 250, 46, 21, 167, 104, 37, 67, 177, 25, 149, 2, 0, 0, 0, 114, 74, 119, 222, 130, 99,
      78, 38, 205, 60, 41, 201, 219, 43, 52, 110, 44, 77, 173, 209, 211, 24, 150, 205, 114, 137,
      152, 201, 0, 183, 124, 109, 217, 186, 199, 249, 57, 92, 215, 245, 13, 84, 15, 12, 2, 145,
      174, 16, 115, 127, 131, 134, 108, 3, 187, 108, 223, 118, 252, 46, 179, 12, 114, 174, 6,
      33, 84, 161, 211, 175, 30, 62, 150, 14, 99, 245, 180, 206, 227, 15, 89, 135, 196, 8, 48,
      174, 82, 34, 131, 224, 227, 229, 236, 53, 45, 160, 195, 219, 83, 102, 188, 78, 188, 109,
      127, 118, 109, 22, 158, 77, 185, 84, 134, 139, 247, 42, 127, 100, 22, 154, 224, 89, 50,
      178, 221, 238, 78, 14, 1, 114, 47, 118, 27, 67, 116, 82, 234, 125, 80, 5, 23, 107, 34, 74,
      188, 122, 185, 128, 46, 84, 194, 85, 11, 196, 124, 42, 106, 198, 207, 178, 239, 125, 211,
      153, 172, 15, 45, 165, 83, 238, 112, 106, 39, 38, 123, 27, 222, 78, 247, 136, 167, 178,
      166, 93, 241, 204, 143, 54, 49, 94, 198, 146, 12, 2, 235, 110, 74, 14, 199, 134, 138, 59,
      77, 169, 1, 110, 37, 162, 251, 43, 189, 252, 47, 247, 111, 184, 115, 0, 100, 222, 32, 198,
      254, 196, 5, 112, 235, 166, 222, 145, 16, 158, 63, 146, 80, 140, 77, 2, 95, 159, 242, 57,
      82, 138, 247, 33, 155, 8, 11, 62, 221, 227, 105, 197, 113, 214, 249, 7, 2, 0,
    ]

    const groupSecretKeyArr = [
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
      0, 0,
    ]

    const publicKeyPackage = publicKeyPackageArr
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    const groupSecretKey = groupSecretKeyArr
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
    const participants = [
      {
        name: 'foo',
        secret: secret1,
        identity: identity1.toString('hex'),
        keyPackage: keyPackage1Arr.map((byte) => byte.toString(16).padStart(2, '0')).join(''),
      },
      {
        name: 'bar',
        secret: secret2,
        identity: secret2.toIdentity().serialize().toString('hex'),
        keyPackage: keyPackage2Arr.map((byte) => byte.toString(16).padStart(2, '0')).join(''),
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
