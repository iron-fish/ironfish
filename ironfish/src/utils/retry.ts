/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type RetryStrategy = {
  delay: number
  jitter: number
  maxDelay: number
  maxRetries?: number
}

export class Retry {
  private readonly strategy: RetryStrategy

  private attempt: number

  constructor(strategy: RetryStrategy) {
    this.strategy = strategy
    this.attempt = 0
  }

  try<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.tryExecutor(fn, resolve, reject)
    })
  }

  private tryExecutor<T>(
    fn: () => Promise<T>,
    resolve: (result: T) => void,
    reject: (error: unknown) => void,
  ) {
    fn()
      .then((result) => {
        this.reset()
        resolve(result)
      })
      .catch((error) => {
        if (this.shouldRetry()) {
          setTimeout(() => {
            this.tryExecutor(fn, resolve, reject)
          }, this.nextDelay())
        } else {
          reject(error)
        }
      })
  }

  private reset() {
    this.attempt = 0
  }

  private shouldRetry(): boolean {
    return this.strategy.maxRetries === undefined || this.attempt < this.strategy.maxRetries
  }

  private nextDelay(): number {
    // exponential backoff
    const delay =
      this.strategy.delay * (2 ** this.attempt + this.strategy.jitter * Math.random())
    this.attempt += 1
    return Math.min(delay, this.strategy.maxDelay)
  }
}
