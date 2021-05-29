/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type MutexUnlockFunction = () => void

export class Mutex {
  private mutex = Promise.resolve()
  private _count = 0

  get waiting(): number {
    return Math.max(this._count - 1, 0)
  }

  get locked(): boolean {
    return this._count > 0
  }

  lock(): PromiseLike<MutexUnlockFunction> {
    let begin: (unlock: MutexUnlockFunction) => void

    this.mutex = this.mutex.then(() => {
      this._count--
      return new Promise(begin)
    })

    return new Promise<MutexUnlockFunction>((resolve) => {
      this._count++
      begin = resolve
    })
  }

  async run<T>(fn: (() => T) | (() => PromiseLike<T>)): Promise<T> {
    const unlock = await this.lock()

    try {
      return await Promise.resolve(fn())
    } finally {
      unlock()
    }
  }
}
