/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IronfishNode } from '../node'
import { DatabaseIsLockedError } from '../storage/database/errors'
import { PromiseUtils } from './promise'

/**
 * Try to open the node DB's and wait until they can be opened
 */
async function waitForOpen(node: IronfishNode, abort?: null | (() => boolean)): Promise<void> {
  let logged = false

  while (!abort || !abort()) {
    try {
      await node.openDB()
      return
    } catch (e) {
      if (e instanceof DatabaseIsLockedError) {
        if (!logged) {
          node.logger.info(
            'Another node is using the database, waiting for that node to close.',
          )
          logged = true
        }

        await PromiseUtils.sleep(500)
        continue
      }

      throw e
    }
  }
}

export const NodeUtils = { waitForOpen }
