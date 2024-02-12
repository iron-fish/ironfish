/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type SigningPackage = {
  signingPackage: string
  unsignedTransaction: string
}

export class SigningPackageEncoder {
  constructor() {}

  encode(signingPackage: SigningPackage): string {
    return Buffer.from(
      JSON.stringify({
        signingPackage,
      }),
    ).toString('base64')
  }

  decode(value: string): SigningPackage {
    const decoded = Buffer.from(value, 'base64').toString()
    return JSON.parse(decoded) as SigningPackage
  }
}
