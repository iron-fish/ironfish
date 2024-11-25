/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ErrorUtils, Logger } from '@ironfish/sdk'
import { ux } from '@oclif/core'
import { ExitError } from '@oclif/core/errors'
import { confirmList } from './prompt'

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
      if (error instanceof ExitError) {
        throw error
      }

      logger.log(`An Error Occurred: ${ErrorUtils.renderError(error)}`)

      if (askToRetry) {
        const continueResponse = await confirmList('Do you want to retry this step?', 'Retry')
        if (!continueResponse) {
          ux.stdout('User chose to not continue.')
          ux.exit(0)
        }
      }
    }
    retries++
  }

  throw new Error('Max retries reached')
}
