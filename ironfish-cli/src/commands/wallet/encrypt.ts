/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { Flags } from '@oclif/core'
 import { IronfishCommand } from '../../command'
 import { RemoteFlags } from '../../flags'
 
 export class EncryptCommand extends IronfishCommand {
   static description = 'Encrypt the wallet accounts for use'
 
   static flags = {
     ...RemoteFlags,
     passphrase: Flags.string({
       required: true,
       description: 'Passphrase for wallet',
     }),
   }
 
   async start(): Promise<void> {
     const { flags } = await this.parse(EncryptCommand)
     const { passphrase } = flags
 
     const client = await this.sdk.connectRpc()
     await client.wallet.encrypt({ passphrase })
     this.log(`Encrypted the wallet`)
   }
 }
 