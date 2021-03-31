/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { Block, NetworkIdentifier } from './api'

/**
 * SearchBlocksRequest is used to search for transactions matching a set of provided conditions in canonical blocks.
 * @export
 * @interface SearchBlocksRequest
 */
export interface SearchBlocksRequest {
  /**
   *
   * @type {NetworkIdentifier}
   * @memberof SearchBlocksRequest
   */
  network_identifier: NetworkIdentifier
  /**
   * seek parameter to offset the pagination at a previous block.\n
   * @type {number}
   * @memberof SearchBlocksRequest
   */
  seek?: number
  /**
   * limit is the maximum number of blocks to return in one call. The implementation may return <= limit blocks.
   * @type {number}
   * @memberof SearchBlocksRequest
   */
  limit?: number
  /**
   *
   * @type {string}
   * @memberof SearchBlocksRequest
   */
  query?: string
}
/**
 * SearchBlocksResponse contains an ordered collection of Blocks that match the query in SearchBlocksRequest. These Blocks are sorted from most recent block to oldest block.
 * @export
 * @interface SearchBlocksResponse
 */
export interface SearchBlocksResponse {
  /**
   * blocks is an array of Block sorted by most recent BlockIdentifier
   * @type {Array<Block>}
   * @memberof SearchBlocksResponse
   */
  blocks: Array<Block>
  /**
   * next_offset is the next offset to use when paginating through block results. If this field is not populated, there are no more blocks to query.
   * @type {number}
   * @memberof SearchBlocksResponse
   */
  next_offset?: number
}
