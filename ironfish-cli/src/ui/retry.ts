/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Logger } from '@ironfish/sdk'
import { confirmPrompt } from './prompt'

export async function retryStep<T>(
  stepFunction: () => Promise<T>,
  logger: Logger,
  askToRetry: boolean = false,
  maxRetries: number = 10,
): Promise<T> {
  // eslint-disable-next-line no-constant-condition
  let retries = 0
  while (retries < maxRetries) {
    try {
      const result = await stepFunction()
      return result
    } catch (error) {
      logger.log(`An Error Occurred: ${(error as Error).message}`)
      if (askToRetry) {
        const continueResponse = await confirmPrompt('Do you want to retry this step?')
        if (!continueResponse) {
          throw new Error('User chose to not continue')
        }
      }
    }
    retries++
  }

  throw new Error('Max retries reached')
}
