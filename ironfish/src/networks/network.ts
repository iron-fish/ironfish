/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Assert } from '../assert'
import { Strategy } from '../strategy'
import { defaultNetworkName, isDefaultNetworkId, NetworkDefinition } from './networkDefinition'

export class Network {
  readonly default: boolean
  readonly name: string
  readonly id: number
  readonly definition: NetworkDefinition
  readonly strategy: Strategy

  constructor(definition: NetworkDefinition, strategy: Strategy) {
    this.id = definition.id
    this.default = isDefaultNetworkId(definition.id)
    this.definition = definition
    this.strategy = strategy

    if (this.default) {
      const defaultName = defaultNetworkName(definition.id)
      Assert.isNotUndefined(defaultName)
      this.name = defaultName
    } else {
      this.name = `Custom Network ${definition.id}`
    }
  }

  miningReward(sequence: number): number {
    return this.strategy.miningReward(sequence)
  }
}
