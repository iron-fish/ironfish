/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Asset, makeTestWitness, multisig, Note as NativeNote } from '@ironfish/rust-nodejs'
import { NoteHasher, Witness } from '../merkletree'
import { Side } from '../merkletree/merkletree'
import { WitnessNode } from '../merkletree/witness'
import { Note, RawTransaction } from '../primitives'
import { Transaction, TransactionVersion } from '../primitives/transaction'

describe('multisig', () => {
  describe('dkg', () => {
    it('should create multisig accounts and sign transactions', () => {
      const participantSecrets = [
        multisig.ParticipantSecret.random(),
        multisig.ParticipantSecret.random(),
        multisig.ParticipantSecret.random(),
      ]

      const secrets = participantSecrets.map((secret) => secret.serialize().toString('hex'))
      const identities = participantSecrets.map((secret) =>
        secret.toIdentity().serialize().toString('hex'),
      )

      const minSigners = 2

      const round1Packages = secrets.map((secret, index) =>
        multisig.dkgRound1(identities[index], minSigners, identities),
      )

      const round1PublicPackages = round1Packages.map(
        (packages) => packages.round1PublicPackage,
      )

      const round2Packages = secrets.map((secret, index) =>
        multisig.dkgRound2(
          secret,
          round1Packages[index].round1SecretPackage,
          round1PublicPackages,
        ),
      )

      const round2PublicPackages = round2Packages.map(
        (packages) => packages.round2PublicPackage,
      )

      const round3Packages = participantSecrets.map((participantSecret, index) =>
        multisig.dkgRound3(
          participantSecret,
          round2Packages[index].round2SecretPackage,
          round1PublicPackages,
          round2PublicPackages,
        ),
      )

      const publicAddress = round3Packages[0].publicAddress

      const raw = new RawTransaction(TransactionVersion.V1)

      const inNote = new NativeNote(
        publicAddress,
        42n,
        Buffer.from(''),
        Asset.nativeId(),
        publicAddress,
      )
      const outNote = new NativeNote(
        publicAddress,
        40n,
        Buffer.from(''),
        Asset.nativeId(),
        publicAddress,
      )
      const asset = new Asset(publicAddress, 'Testcoin', 'A really cool coin')
      const mintOutNote = new NativeNote(
        publicAddress,
        5n,
        Buffer.from(''),
        asset.id(),
        publicAddress,
      )

      const testWitness = makeTestWitness(inNote)
      const noteHasher = new NoteHasher()
      const authPath: WitnessNode<Buffer>[] = testWitness.authPath.map((node) => {
        return {
          side: node.side ? Side.Right : Side.Left,
          hashOfSibling: node.hashOfSibling,
        }
      })
      const witness = new Witness(
        testWitness.treeSize,
        testWitness.rootHash,
        authPath,
        noteHasher,
      )

      raw.spends.push({ note: new Note(inNote.serialize()), witness })
      raw.outputs.push({ note: new Note(outNote.serialize()) })
      raw.outputs.push({ note: new Note(mintOutNote.serialize()) })
      raw.mints.push({
        creator: asset.creator().toString('hex'),
        name: asset.name().toString(),
        metadata: asset.metadata().toString(),
        value: mintOutNote.value(),
      })
      raw.fee = 1n

      const proofAuthorizingKey = round3Packages[0].proofAuthorizingKey
      const viewKey = round3Packages[0].viewKey
      const outgoingViewKey = round3Packages[0].outgoingViewKey

      const unsignedTransaction = raw.build(proofAuthorizingKey, viewKey, outgoingViewKey)
      const transactionHash = unsignedTransaction.hash()

      const commitments = secrets.map((secret, index) =>
        multisig.createSigningCommitment(
          secret,
          round3Packages[index].keyPackage,
          transactionHash,
          identities,
        ),
      )

      const signingPackage = unsignedTransaction.signingPackage(commitments)

      const signatureShares = secrets.map((secret, index) =>
        multisig.createSignatureShare(secret, round3Packages[index].keyPackage, signingPackage),
      )

      const serializedTransaction = multisig.aggregateSignatureShares(
        round3Packages[0].publicKeyPackage,
        signingPackage,
        signatureShares,
      )
      const transaction = new Transaction(serializedTransaction)

      expect(transaction.unsignedHash().equals(transactionHash)).toBeTruthy()
    })
  })
})
