/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createRootLogger, Logger } from '@ironfish/sdk'

/**
 * Creates a logger that should be used in simulations. This logger will
 * do a bunch of extra stuff that is useful for debugging. Currently it does nothing.
 *
 * @returns a logger
 */
export function createSimulatorLogger(): Logger {
  const rootLogger = createRootLogger()
  return rootLogger
}
