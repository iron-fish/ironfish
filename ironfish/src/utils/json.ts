/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import parseJson, { JSONError } from 'parse-json'
import { Assert } from '../assert'

export class ParseJsonError extends Error {
  jsonMessage: string
  jsonFileName: string
  jsonCodeFrame: string

  constructor(fileName: string, message: string, codeFrame: string) {
    super(`Parsing ${fileName} Failed\n${message}`)
    this.jsonFileName = fileName
    this.jsonMessage = message
    this.jsonCodeFrame = codeFrame
  }
}

function parse<T = unknown>(data: string, fileName?: string): T {
  const [result, error] = tryParse<T>(data, fileName)
  if (error) {
    throw error
  }
  Assert.isNotNull(result)
  return result
}

function tryParse<T = unknown>(
  data: string,
  fileName?: string,
): [T, null] | [null, ParseJsonError] {
  try {
    const config = parseJson(data, fileName || '') as T
    return [config, null]
  } catch (e) {
    if (e instanceof JSONError) {
      const error = new ParseJsonError(e.fileName, e.message, e.codeFrame)
      return [null, error]
    }

    throw e
  }
}

export const JSONUtils = { parse, tryParse }
