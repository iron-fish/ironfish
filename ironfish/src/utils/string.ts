/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import crypto from 'crypto'

/**
 * A simple MD5 number hash from a string
 *
 * This is not meant for any production or cryptographic use just a
 * simple way to hash a string for test or display purposes
 */
function hashToNumber(value: string): number {
  return parseInt(hash(value).toString('hex'), 16)
}

/**
 * A simple MD5 hash from a string
 *
 * This is not meant for any production or cryptographic use just a
 * simple way to hash a string for test or display purposes
 */
function hash(value: string): Buffer {
  return Buffer.from(crypto.createHash('md5').update(value).digest('hex'))
}

/**
 * Get the length in bytes of a given string
 * @param value The string to get the byte length for
 * @param encoding An optional encoding
 * @returns The number of bytes it takes to store the string
 */
const getByteLength = (value: string, encoding?: BufferEncoding): number => {
  return Buffer.from(value, encoding).byteLength
}

export const StringUtils = { hash, hashToNumber, getByteLength }
