/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type JsonSerializable =
  | string
  | number
  | boolean
  | null
  | Buffer
  | JsonSerializable[]
  | { [key: string]: JsonSerializable }

export type IJsonSerializable =
  | string
  | number
  | boolean
  | bigint
  | null
  | Buffer
  | IJsonSerializable[]
  | { [key: string]: IJsonSerializable }
  | unknown

/**
 * Interface for objects that can be serialized, deserialized, and compared for equality.
 *
 * It surprises me that Javascript doesn't have some sort of native or standard
 * support for this.
 */
export interface Serde<E, SE = JsonSerializable> {
  /** Determine whether two elements should be considered equal */
  equals(element1: E, element2: E): boolean
  /**
   * Convert an element to a serialized form suitable for storage or
   * to be sent over the network.
   */
  serialize(element: E): SE
  /**
   * Convert serialized data from the database or network to an element.
   *
   * May throw an error if the data cannot be deserialized.
   */
  deserialize(data: SE): E
}
