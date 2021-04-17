/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type MutexUnlockFunction = () => void

export class Mutex {
  private mutex = Promise.resolve()

  lock(): PromiseLike<MutexUnlockFunction> {
    let begin: (unlock: MutexUnlockFunction) => void

    this.mutex = this.mutex.then(() => {
      return new Promise(begin)
    })

    return new Promise<MutexUnlockFunction>((resolve) => {
      begin = resolve
    })
  }

  async dispatch<T>(fn: (() => T) | (() => PromiseLike<T>)): Promise<T> {
    const unlock = await this.lock()
    try {
      return await Promise.resolve(fn())
    } finally {
      unlock()
    }
  }
}
