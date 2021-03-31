/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* eslint-disable @typescript-eslint/no-explicit-any */

declare module 'json-colorizer' {
  export type ColorizeOptions = {
    pretty?: boolean
    colors: Partial<{
      BRACE: string
      BRACKET: string
      COLON: string
      COMMA: string
      STRING_KEY: string
      STRING_LITERAL: string
      NUMBER_LITERAL: string
      BOOLEAN_LITERAL: string
      NULL_LITERAL: string
    }>
  }
  function colorize(data: any, options?: ColorizeOptions): string
  function colorize(string: string, options?: ColorizeOptions): string

  export default colorize
}
