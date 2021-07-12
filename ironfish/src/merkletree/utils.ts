/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { LeafIndex, NodeIndex } from './merkletree'

/**
 * Is the given leaf a right child or left child of its parent node.
 *
 * Leaves are added in order, so this is the same as asking if the index
 * is an od number
 */
export function isRight(index: LeafIndex): boolean {
  return index % 2 === 1
}

/**
 * Is the given node index the empty node above the root node?
 */
export function isEmpty(index: NodeIndex | undefined): index is undefined | 0 {
  return index === 0 || index === undefined
}

/**
 * The depth of the tree when it contains a certain number of leaf nodes
 */
export function depthAtLeafCount(size: number): number {
  if (size === 0) {
    return 0
  }

  if (size === 1) {
    return 1
  }

  return Math.floor(Math.log2(size - 1)) + 2
}
