/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
export class Gauge {
  private _value: number

  constructor() {
    this._value = 0
  }

  get(): number {
    return this._value
  }

  set(value: number): void {
    this._value = value
  }
}
