/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export type CeremonyServerMessage =
  | {
      method: 'joined'
      queueLocation: number
    }
  | {
      method: 'initiate-contribution'
      downloadLink: string
      contributionNumber: number
    }
  | {
      method: 'initiate-upload'
      uploadLink: string
    }
  | {
      method: 'contribution-verified'
      hash: string
    }

export type CeremonyClientMessage =
  | {
      method: 'contribution-complete'
    }
  | {
      method: 'upload-complete'
    }
