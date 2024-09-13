/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import {
  MultisigHardwareSigner,
  MultisigKeys,
  MultisigSigner,
} from '../interfaces/multisigKeys'

export interface MultisigSignerTrustedDealerImport {
  identity: string
  keyPackage: string
  publicKeyPackage: string
}

// Multisig signing data can come from:
// 1. Regular account export and imported which will have the secret
// 2. Import from a trusted dealer, which will only have the identity
export type MultisigKeysImport = MultisigKeys | MultisigSignerTrustedDealerImport

export function isMultisigSignerImport(data: MultisigKeysImport): data is MultisigSigner {
  return 'secret' in data
}

export function isMultisigHardwareSignerImport(
  data: MultisigKeysImport,
): data is MultisigHardwareSigner {
  return 'identity' in data && !('keyPackage' in data)
}

export function isMultisigSignerTrustedDealerImport(
  data: MultisigKeysImport,
): data is MultisigSignerTrustedDealerImport {
  return 'identity' in data && 'keyPackage' in data
}
