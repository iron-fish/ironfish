/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Request, Response, NextFunction } from 'express'

import { RequestError, isRouteErrorType } from '../types/RouteError'

export const errorHandler = (
  error: RequestError,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (isRouteErrorType(error)) {
    res.status(error.status).json({
      error: {
        type: 'request_validation',
        message: error.message,
      },
    })
    return
  }
  next(error)
}
