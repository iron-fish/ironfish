/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

 use napi::{
     bindgen_prelude::{Buffer, Result}, JsBuffer,
 };
 use napi_derive::napi;

 use ironfish::transaction::unsigned::UnsignedTransaction as UnsignedTransactionRust;
 
 use crate::to_napi_err;
 
 #[napi]
 pub struct UnsignedTransaction {
     transaction: UnsignedTransactionRust,
 }
 
 #[napi]
 impl UnsignedTransaction {
     #[napi(constructor)]
     pub fn new(js_bytes: JsBuffer) -> Result<UnsignedTransaction> {
         let bytes = js_bytes.into_value()?;
 
         let transaction = UnsignedTransactionRust::read(bytes.as_ref()).map_err(to_napi_err)?;
 
         Ok(UnsignedTransaction { transaction })
     }
 
     #[napi]
     pub fn serialize(&self) -> Result<Buffer> {
         let mut vec: Vec<u8> = vec![];
         self.transaction.write(&mut vec).map_err(to_napi_err)?;
 
         Ok(Buffer::from(vec))
     }
 }
 