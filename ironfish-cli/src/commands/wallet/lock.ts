/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
 import { Flags, ux } from '@oclif/core'
 import { IronfishCommand } from '../../command'
 import { RemoteFlags } from '../../flags'
 
 export class LockCommand extends IronfishCommand {
   static description = 'Lock the wallet accounts'
 
   static flags = {
     ...RemoteFlags,
   }
 
   async start(): Promise<void> {
     const client = await this.sdk.connectRpc()
     await client.wallet.lock({})
     this.log('Locked the wallet')
   }
 }
 