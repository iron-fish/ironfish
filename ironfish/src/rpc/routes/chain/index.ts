/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ApiNamespace, router } from '../router'
export * as BroadcastTransaction from './broadcastTransaction'
export * as EstimateFeeRate from './estimateFeeRate'
export * as EstimateFeeRates from './estimateFeeRates'
export * as ExportChainStream from './exportChainStream'
export * as FollowChainStream from './followChainStream'
export * as GetAsset from './getAsset'
export * as GetBlock from './getBlock'
export * as GetChainInfo from './getChainInfo'
export * as GetConsensusParameters from './getConsensusParameters'
export * as GetDifficulty from './getDifficulty'
export * as GetNetworkHashPower from './getNetworkHashPower'
export * as GetNetworkInfo from './getNetworkInfo'
export * as GetNoteWitness from './getNoteWitness'
export * as GetTransaction from './getTransaction'
export * as GetTransactionStream from './getTransactionStream'
export * as IsValidPublicAddress from './isValidPublicAddress'
export * as ShowChain from './showChain'

import * as Routes from './'

router.registerRouteFile(Routes.BroadcastTransaction, ApiNamespace.chain)
router.registerRouteFile(Routes.EstimateFeeRate, ApiNamespace.chain)
router.registerRouteFile(Routes.EstimateFeeRates, ApiNamespace.chain)
router.registerRouteFile(Routes.ExportChainStream, ApiNamespace.chain)
router.registerRouteFile(Routes.FollowChainStream, ApiNamespace.chain)
router.registerRouteFile(Routes.GetBlock, ApiNamespace.chain)
router.registerRouteFile(Routes.GetChainInfo, ApiNamespace.chain)
router.registerRouteFile(Routes.GetDifficulty, ApiNamespace.chain)
router.registerRouteFile(Routes.GetNetworkHashPower, ApiNamespace.chain)
router.registerRouteFile(Routes.GetTransaction, ApiNamespace.chain)
router.registerRouteFile(Routes.GetTransactionStream, ApiNamespace.chain)
router.registerRouteFile(Routes.ShowChain, ApiNamespace.chain)
router.registerRouteFile(Routes.GetConsensusParameters, ApiNamespace.chain)
router.registerRouteFile(Routes.GetAsset, ApiNamespace.chain)
router.registerRouteFile(Routes.GetNetworkInfo, ApiNamespace.chain)
router.registerRouteFile(Routes.GetNoteWitness, ApiNamespace.chain)
router.registerRouteFile(Routes.IsValidPublicAddress, ApiNamespace.chain)
