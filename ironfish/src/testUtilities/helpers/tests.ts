/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PromiseUtils } from '../../utils'

/**
 * You can use this to wait on a deferred task
 * that's deferred through either a setTimeout(0)
 * or a created promise that's immediately resolved
 * on the next event queue.
 */
export async function flushTimeout(): Promise<void> {
  await PromiseUtils.sleep(0)
}
