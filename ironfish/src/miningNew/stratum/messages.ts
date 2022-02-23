/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type StratumMessageMiningSubscribe = {
  id: number
  method: 'mining.subscribe'
  params: string
}

export type StratumMessageMiningSubmit = {
  id: number
  method: 'mining.submit'
  params: [requestId: number, randomness: number, graffiti: string]
}

export type StratumRequest =
  | {
      id: number
      method?: string
    }
  | StratumMessageMiningSubmit
  | StratumMessageMiningSubscribe

export type StratumResponse =
  | {
      id: number
      method?: string
      params?: unknown
    }
  | StratumMessageMiningSetTarget
  | StratumMessageMiningNotify
  | StratumMessageMiningSubscribed

export type StratumMessageMiningSetTarget = {
  id: number
  method: 'mining.set_target'
  params: [target: string]
}

export type StratumMessageMiningNotify = {
  id: number
  method: 'mining.notify'
  params: [requestId: number, headerHex: string]
}

export type StratumMessageMiningSubscribed = {
  id: number
  method?: string
  result: number
}

export type StratumNotification = {
  // Technically this wont have an id, but placeholder
  id: number
  method?: string
  params?: unknown
}

export type StratumMessage = StratumRequest | StratumResponse | StratumNotification
