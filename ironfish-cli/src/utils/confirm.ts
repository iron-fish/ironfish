/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { ux } from '@oclif/core'

export const confirmOperation = async (options: {
  confirmMessage?: string
  cancelledMessage?: string
  confirm?: boolean
}) => {
  const { confirmMessage, cancelledMessage, confirm } = options

  if (confirm) {
    return true
  }

  const confirmed = await ux.confirm(confirmMessage || 'Do you confirm (Y/N)?')

  if (!confirmed) {
    ux.log(cancelledMessage || 'Operation aborted.')
    ux.exit(0)
  }
}
