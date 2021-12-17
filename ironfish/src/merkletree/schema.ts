/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DatabaseKey, DatabaseSchema } from '../storage'
import { LeafIndex, NodeIndex, Side } from './merkletree'

interface CounterEntry<T extends string> extends DatabaseSchema {
  key: T
  value: number
}

export type CounterSchema = CounterEntry<'Leaves'> | CounterEntry<'Nodes'>

export interface LeavesSchema<E, H> extends DatabaseSchema {
  key: LeafIndex
  value: {
    index: LeafIndex
    element: E
    merkleHash: H
    parentIndex: NodeIndex
  }
}

export interface LeavesIndexSchema<H extends DatabaseKey> extends DatabaseSchema {
  key: H
  value: LeafIndex
}

export type NodeValue<H> = {
  index: NodeIndex
  side: Side
  hashOfSibling: H
  parentIndex?: NodeIndex // left nodes have a parent index
  leftIndex?: NodeIndex // right nodes have a left index
}

export interface NodesSchema<H> extends DatabaseSchema {
  key: NodeIndex
  value: NodeValue<H>
}
