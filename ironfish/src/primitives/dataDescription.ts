/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export enum DataType {
  Undefined = 1,
  EVM = 2,
}

export interface DataDescription {
  dataType: DataType
  data: Buffer
}
