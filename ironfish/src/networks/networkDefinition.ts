/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { Assert } from '../assert'
import { ActivationSequence, Checkpoint, ConsensusParameters } from '../consensus'
import { Config, InternalStore } from '../fileStores'
import { FileSystem } from '../fileSystems'
import { SerializedBlock } from '../primitives/block'
import { IJSON } from '../serde'
import { DEVNET } from './definitions/devnet'
import { MAINNET } from './definitions/mainnet'
import { TESTNET } from './definitions/testnet'

export type NetworkDefinition = {
  id: number
  bootstrapNodes: string[]
  genesis: SerializedBlock
  consensus: ConsensusParameters
}

export const ConsensusParametersSchema: yup.ObjectSchema<ConsensusParameters> = yup
  .object({
    allowedBlockFutureSeconds: yup.number().integer().defined(),
    genesisSupplyInIron: yup.number().integer().defined(),
    targetBlockTimeInSeconds: yup.number().integer().defined(),
    targetBucketTimeInSeconds: yup.number().integer().defined(),
    maxBlockSizeBytes: yup.number().integer().defined(),
    minFee: yup.number().integer().defined(),
    enableAssetOwnership: yup.mixed<ActivationSequence>().defined(),
    enforceSequentialBlockTime: yup.mixed<ActivationSequence>().defined(),
    enableFishHash: yup.mixed<ActivationSequence>().defined(),
    enableIncreasedDifficultyChange: yup.mixed<ActivationSequence>().defined(),
    checkpoints: yup
      .array()
      .of<Checkpoint>(
        yup
          .object({ sequence: yup.number().defined(), hash: yup.string().defined() })
          .defined(),
      )
      .defined(),
  })
  .defined()

export const networkDefinitionSchema: yup.ObjectSchema<NetworkDefinition> = yup
  .object({
    id: yup.number().integer().min(0).defined(),
    bootstrapNodes: yup.array().of(yup.string().defined()).defined(),
    genesis: yup
      .object({
        header: yup
          .object({
            sequence: yup.number().integer().defined(),
            previousBlockHash: yup.string().defined(),
            noteCommitment: yup.mixed<Buffer>().defined(),
            transactionCommitment: yup.mixed<Buffer>().defined(),
            target: yup.string().defined(),
            randomness: yup.string().defined(),
            timestamp: yup.number().integer().defined(),
            noteSize: yup.number().integer().nullable().defined(),
            work: yup.string().optional(),
            graffiti: yup.string().defined(),
          })
          .defined(),
        transactions: yup.array().of<Buffer>(yup.mixed<Buffer>()).defined(),
      })
      .defined(),
    consensus: ConsensusParametersSchema,
  })
  .defined()

export function isDefaultNetworkId(networkId: number): boolean {
  return networkId <= 100
}

export function defaultNetworkName(networkId: number): string | undefined {
  switch (networkId) {
    case 0:
      return 'Testnet'
    case 1:
      return 'Mainnet'
    case 2:
      return 'Devnet'
  }
}

export function renderNetworkName(networkId: number): string {
  if (isDefaultNetworkId(networkId)) {
    const defaultName = defaultNetworkName(networkId)
    Assert.isNotUndefined(defaultName)
    return defaultName
  } else {
    return `Custom Network ${networkId}`
  }
}

export async function getNetworkDefinition(
  config: Config,
  internal: InternalStore,
  files: FileSystem,
  customNetworkPath?: string,
  networkIdOverride?: number,
): Promise<NetworkDefinition> {
  let networkDefinition: NetworkDefinition

  // Try fetching custom network definition first, if it exists
  if (customNetworkPath) {
    const networkDefinitionJSON = await files.readFile(files.resolve(customNetworkPath))
    networkDefinition = await networkDefinitionSchema.validate(
      IJSON.parse(networkDefinitionJSON) as NetworkDefinition,
    )
  } else {
    if (
      internal.isSet('networkId') &&
      networkIdOverride !== undefined &&
      internal.get('networkId') !== networkIdOverride
    ) {
      throw Error('Network ID flag does not match network ID stored in datadir')
    }

    const networkId =
      networkIdOverride !== undefined ? networkIdOverride : internal.get('networkId')

    if (networkId === 0) {
      networkDefinition = TESTNET
    } else if (networkId === 1) {
      networkDefinition = MAINNET
    } else if (networkId === 2) {
      networkDefinition = DEVNET
    } else {
      const networkDefinitionJSON = await files.readFile(config.networkDefinitionPath)
      networkDefinition = await networkDefinitionSchema.validate(
        IJSON.parse(networkDefinitionJSON) as NetworkDefinition,
      )
    }
  }

  if (internal.isSet('networkId') && networkDefinition.id !== internal.get('networkId')) {
    throw Error('Network ID in network definition does not match network ID stored in datadir')
  }

  if (customNetworkPath) {
    if (isDefaultNetworkId(networkDefinition.id)) {
      throw Error('Cannot start custom network with a reserved network ID')
    }

    // Copy custom network definition to data directory for future use
    await files.writeFile(config.networkDefinitionPath, IJSON.stringify(networkDefinition))
  }

  internal.set('networkId', networkDefinition.id)

  return networkDefinition
}
