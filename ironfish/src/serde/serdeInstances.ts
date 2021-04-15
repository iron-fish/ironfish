/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BufferSerde } from './BufferSerde'

const BufferSerde32Instance = new BufferSerde(32)

export const BlockHashSerdeInstance = BufferSerde32Instance
export const GraffitiSerdeInstance = BufferSerde32Instance
export const NullifierSerdeInstance = BufferSerde32Instance
