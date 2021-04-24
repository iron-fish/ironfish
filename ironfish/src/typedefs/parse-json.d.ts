/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'parse-json' {
  type Reviver = (this: any, key: string, value: any) => any

  function parse(string: string, filename: string): any
  function parse(string: string, reviver: Reviver, filename: string): any

  export class JSONError extends Error {
    fileName: string
    codeFrame: string
  }

  export default parse
}
