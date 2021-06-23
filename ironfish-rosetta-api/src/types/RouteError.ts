/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type RequestError = Record<string, unknown>
export type RouteError = {
  status: number
  message?: string
}

export const isRouteErrorType = (error: RequestError): error is RouteError =>
  error !== null &&
  'status' in error &&
  typeof error.status === 'number' &&
  (!('message' in error) || typeof error.message === 'string')
