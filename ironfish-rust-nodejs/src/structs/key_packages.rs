// #[napi(js_name = "NoteEncrypted")]
// pub struct TrustedDealerKeyPackages {
//     pub(crate) verifyingKey: JsJsString,
//     pub(crate) proofGenerationKey: JsString,
//     pub(crate) viewKey: JsString,
//     pub(crate) incomingViewKey: JsString,
//     pub(crate) outgoingViewKey: JsString,
//     pub(crate) publicAddress: JsString,
//     pub(crate) keyPackages: { [Identifier]: JsString } // serialized key package,
//     pub(crate) publicKeyPackage: {,
//       groupVerifyingShares: { [Identifier]: JsString },
//       groupVerifyingKey: JsString,
//     },
//   }