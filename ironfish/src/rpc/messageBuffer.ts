/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { MESSAGE_DELIMITER } from './adapters/socketAdapter/protocol'

export class MessageBuffer {
  private readonly delimiter: string
  private buffer: string

  constructor(delimiter = MESSAGE_DELIMITER) {
    this.delimiter = delimiter
    this.buffer = ''
  }

  write(data: Buffer): void {
    this.buffer += data.toString('utf-8')
  }

  clear(): void {
    this.buffer = ''
  }

  readMessages(): string[] {
    const lastDelimiterIndex = this.buffer.lastIndexOf(this.delimiter)

    // buffer contains no full messages
    if (lastDelimiterIndex === -1) {
      return []
    }

    const messages = this.buffer.substring(0, lastDelimiterIndex).trim().split(this.delimiter)
    this.buffer = this.buffer.substring(lastDelimiterIndex + 1)
    return messages
  }
}
