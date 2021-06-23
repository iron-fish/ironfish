/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { transports, createLogger, format } from 'winston'

/**
 * Logger system using winston
 * Allows to write errors to error.log and other log to combined.log
 */
export const Logger = createLogger({
  level: 'debug',
  format: format.combine(format.errors({ stack: true }), format.timestamp(), format.json()),
  defaultMeta: { service: 'user-service' },
  transports: [new transports.Console({ format: format.simple() })],
})
