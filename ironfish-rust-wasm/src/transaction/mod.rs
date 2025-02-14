/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

mod burns;
mod mints;
mod outputs;
mod spends;
mod unsigned;

use crate::{errors::IronfishError, primitives::PublicKey, wasm_bindgen_wrapper};
use wasm_bindgen::prelude::*;

pub use burns::BurnDescription;
pub use mints::{MintDescription, UnsignedMintDescription};
pub use outputs::OutputDescription;
pub use spends::{SpendDescription, UnsignedSpendDescription};
pub use unsigned::UnsignedTransaction;

#[cfg(feature = "transaction-proofs")]
mod proposed;

#[cfg(feature = "transaction-builders")]
pub use self::{mints::MintBuilder, spends::SpendBuilder};

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct Transaction(ironfish::Transaction);
}

#[wasm_bindgen]
impl Transaction {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Transaction, IronfishError> {
        Ok(Self(ironfish::Transaction::read(bytes)?))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize transaction");
        buf
    }

    #[wasm_bindgen(getter)]
    pub fn fee(&self) -> i64 {
        self.0.fee()
    }

    #[wasm_bindgen(getter)]
    pub fn expiration(&self) -> u32 {
        self.0.expiration()
    }

    #[wasm_bindgen(getter, js_name = randomizedPublicKey)]
    pub fn randomized_public_key(&self) -> PublicKey {
        self.0.randomized_public_key().clone().into()
    }

    #[wasm_bindgen(getter)]
    pub fn spends(&self) -> Vec<SpendDescription> {
        self.0
            .spends()
            .iter()
            .cloned()
            .map(SpendDescription::from)
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn outputs(&self) -> Vec<OutputDescription> {
        self.0
            .outputs()
            .iter()
            .cloned()
            .map(OutputDescription::from)
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn mints(&self) -> Vec<MintDescription> {
        self.0
            .mints()
            .iter()
            .cloned()
            .map(MintDescription::from)
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn burns(&self) -> Vec<BurnDescription> {
        self.0
            .burns()
            .iter()
            .cloned()
            .map(BurnDescription::from)
            .collect()
    }

    #[wasm_bindgen(js_name = transactionSignatureHash)]
    pub fn transaction_signature_hash(&self) -> Result<Vec<u8>, IronfishError> {
        self.0
            .transaction_signature_hash()
            .map(|hash| hash.to_vec())
            .map_err(|err| err.into())
    }
}

#[cfg(test)]
mod tests {
    use super::Transaction;
    use hex_literal::hex;
    use wasm_bindgen_test::wasm_bindgen_test;

    // Transaction copied from one of the fixtures in the `ironfish` NodeJS package
    const TEST_TRANSACTION_BYTES: [u8; 661] = hex!(
        "010000000000000000010000000000000000000000000000000000000000000000006cca88ffffffff00000000\
        5e0c3088ca0767097b456c190416cc9ec82a296d5500876ce394218cde263c3e987762affaec55596ab06f7d7f4\
        6dd949762f7705fc4978e64842242c59ff99e4dab95eaa46384f3e2e2705732db4d458bb3146e28620273558cc6\
        e31d2c4f5127d0e787468e5a56ca0d0a30b0434e22b2438e9d026f63be9dac46500671cb67197dd654f3e8fe68a\
        e3abca0fcc50009a89751a2f179c7470888f8a107492606cd30103a72870af2f87adf8210a2cb3d8d73f1150d99\
        e0dfbbb9daaba03e7daf24e26dd468b572b3dded502311ab83c17b87eb3db1a1bb8f7a3c5af0d40035d11b15a3c\
        e6f235138b2ef5f9853a01d61b9a9e549290618fbd697330380b9f0712e1d926b454b7a4cb7ddad47220bbaae68\
        34ab67e0b42d6dd13b70d5ffb49c7067da8db3832b9f444990950bc25d7741a7ccb236b6a2eb346cfe8e02a34e6\
        b2f2993889cd256f9eb4cd2eebdc2bfdb9805e60730c92581fa4fea090f7baafcb8bf18a233ab150764bb76285b\
        22b0f16831b8a3f47b4d41e96ab00a30e86994b4fb7b5a49d3ef8d37cce7035e741d1eacf649356f61169b06490\
        d702e34033d35f446864085f51315048de2e827746928492ef8cdec5c4faadf5bc82877462291118b643f44da99\
        e82335717cf1da9f149cc556100c4bd76c49726f6e2046697368206e6f746520656e6372797074696f6e206d696\
        e6572206b6579303030303030303030303030303030303030303030303030303030303030303030303030303030\
        303030303030be04297828e5177a3ac901e89a7224a7e8f760a4377fc46b46384f3ef90a0c38e95fa386d2306f9\
        8aeddeb6532ef022fb13e3b695d6df812587cd5eda684e502"
    );

    #[test]
    #[wasm_bindgen_test]
    fn deserialize() {
        let tx = Transaction::deserialize(TEST_TRANSACTION_BYTES.as_slice())
            .expect("reading transaction should have succeeded");

        assert_eq!(tx.fee(), -2_000_000_000);
        assert_eq!(tx.expiration(), 0);
        assert_eq!(
            tx.randomized_public_key().serialize(),
            hex!("5e0c3088ca0767097b456c190416cc9ec82a296d5500876ce394218cde263c3e")
        );

        assert_eq!(tx.spends().len(), 0);
        assert_eq!(tx.outputs().len(), 1);
        assert_eq!(tx.mints().len(), 0);
        assert_eq!(tx.burns().len(), 0);

        let [output] = &tx.outputs()[..] else {
            panic!("expected exactly one output")
        };
        output
            .partial_verify()
            .expect("output verification should have succeeded");
        assert_eq!(
            output.merkle_note().merkle_hash().serialize(),
            hex!("2e1d926b454b7a4cb7ddad47220bbaae6834ab67e0b42d6dd13b70d5ffb49c70")
        );

        assert_eq!(
            tx.transaction_signature_hash().unwrap(),
            hex!("2ab1daec6bbb764e4247d3d82f1aa6da9eb71b98ac9e0dfc61e1d8aec487c9d2")
        );
    }

    #[test]
    #[wasm_bindgen_test]
    fn deserialize_failure() {
        Transaction::deserialize(b"abc").expect_err("reading transaction should have failed");
    }
}
