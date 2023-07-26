/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import * as yup from 'yup'
import { ConsensusParameters } from './consensus'
import { DEVNET, isDefaultNetworkId, MAINNET, TESTNET } from './defaultNetworkDefinitions'
import { Config, InternalStore } from './fileStores'
import { FileSystem } from './fileSystems'
import { SerializedBlock } from './primitives/block'
import { IJSON } from './serde'

export type NetworkDefinition = {
  id: number
  bootstrapNodes: string[]
  genesis: SerializedBlock
  consensus: ConsensusParameters
}

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
    consensus: yup
      .object({
        allowedBlockFutureSeconds: yup.number().integer().defined(),
        genesisSupplyInIron: yup.number().integer().defined(),
        targetBlockTimeInSeconds: yup.number().integer().defined(),
        targetBucketTimeInSeconds: yup.number().integer().defined(),
        maxBlockSizeBytes: yup.number().integer().defined(),
        minFee: yup.number().integer().defined(),
        disallowNegativeBlockMineTime: yup.number().integer().defined(),
      })
      .defined(),
  })
  .defined()

export async function getNetworkDefinition(
  config: Config,
  internal: InternalStore,
  files: FileSystem,
): Promise<NetworkDefinition> {
  let networkDefinitionJSON = ''

  // Try fetching custom network definition first, if it exists
  if (config.isSet('customNetwork')) {
    networkDefinitionJSON = await files.readFile(files.resolve(config.get('customNetwork')))
  } else {
    if (
      internal.isSet('networkId') &&
      config.isSet('networkId') &&
      internal.get('networkId') !== config.get('networkId')
    ) {
      throw Error('Network ID flag does not match network ID stored in datadir')
    }

    const networkId = config.isSet('networkId')
      ? config.get('networkId')
      : internal.get('networkId')

    if (networkId === 0) {
      networkDefinitionJSON = TESTNET
    } else if (networkId === 1) {
      networkDefinitionJSON = MAINNET
    } else if (networkId === 2) {
      networkDefinitionJSON = DEVNET
    } else {
      networkDefinitionJSON = await files.readFile(config.get('networkDefinitionPath'))
    }
  }

  const networkDefinition = await networkDefinitionSchema.validate(
    IJSON.parse(networkDefinitionJSON) as NetworkDefinition,
  )

  if (internal.isSet('networkId') && networkDefinition.id !== internal.get('networkId')) {
    throw Error('Network ID in network definition does not match network ID stored in datadir')
  }

  if (config.isSet('customNetwork')) {
    if (isDefaultNetworkId(networkDefinition.id)) {
      throw Error('Cannot start custom network with a reserved network ID')
    }

    // Copy custom network definition to data directory for future use
    await files.writeFile(config.get('networkDefinitionPath'), networkDefinitionJSON)
  }

  internal.set('networkId', networkDefinition.id)

  return networkDefinition
}
