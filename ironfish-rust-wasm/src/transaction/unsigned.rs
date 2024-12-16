/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::{
    errors::IronfishError,
    keys::SaplingKey,
    primitives::{Fr, PublicKey, Signature},
    transaction::{
        BurnDescription, OutputDescription, Transaction, UnsignedMintDescription,
        UnsignedSpendDescription,
    },
    wasm_bindgen_wrapper,
};
use wasm_bindgen::prelude::*;

wasm_bindgen_wrapper! {
    #[derive(Clone, Debug)]
    pub struct UnsignedTransaction(ironfish::transaction::unsigned::UnsignedTransaction);
}

#[wasm_bindgen]
impl UnsignedTransaction {
    #[wasm_bindgen(constructor)]
    pub fn deserialize(bytes: &[u8]) -> Result<Self, IronfishError> {
        Ok(Self(
            ironfish::transaction::unsigned::UnsignedTransaction::read(bytes)?,
        ))
    }

    #[wasm_bindgen]
    pub fn serialize(&self) -> Vec<u8> {
        let mut buf = Vec::new();
        self.0
            .write(&mut buf)
            .expect("failed to serialize unsigned spend description");
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

    #[wasm_bindgen(getter, js_name = publicKeyRandomness)]
    pub fn public_key_randomness(&self) -> Fr {
        self.0.public_key_randomness().into()
    }

    #[wasm_bindgen(getter, js_name = randomizedPublicKey)]
    pub fn randomized_public_key(&self) -> PublicKey {
        self.0.randomized_public_key().clone().into()
    }

    #[wasm_bindgen(getter)]
    pub fn spends(&self) -> Vec<UnsignedSpendDescription> {
        self.0
            .spends()
            .iter()
            .cloned()
            .map(|desc| desc.into())
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn outputs(&self) -> Vec<OutputDescription> {
        self.0
            .outputs()
            .iter()
            .cloned()
            .map(|desc| desc.into())
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn mints(&self) -> Vec<UnsignedMintDescription> {
        self.0
            .mints()
            .iter()
            .cloned()
            .map(|desc| desc.into())
            .collect()
    }

    #[wasm_bindgen(getter)]
    pub fn burns(&self) -> Vec<BurnDescription> {
        self.0
            .burns()
            .iter()
            .cloned()
            .map(|desc| desc.into())
            .collect()
    }

    #[wasm_bindgen(js_name = transactionSignatureHash)]
    pub fn transaction_signature_hash(&self) -> Result<Vec<u8>, IronfishError> {
        self.0
            .transaction_signature_hash()
            .map(|hash| hash.to_vec())
            .map_err(|err| err.into())
    }

    #[wasm_bindgen]
    pub fn sign(self, spender_key: &SaplingKey) -> Result<Transaction, IronfishError> {
        self.0
            .sign(spender_key.as_ref())
            .map(|d| d.into())
            .map_err(|e| e.into())
    }

    #[wasm_bindgen(js_name = addSignature)]
    pub fn add_signature(mut self, signature: Signature) -> Transaction {
        let signature: [u8; 64] = signature
            .serialize()
            .try_into()
            .expect("signature serialization had an unexpected length");
        // `self.0.add_signature()` returns a `Result<Transaction, IronfishError>` because it
        // accepts a `[u8; 64]` instead of `Signature`. The only way `self.0.add_signature()` can
        // fail is if the signature array cannot be parsed into a `Signature`, but because our
        // array comes from a valid `Signature`, this in theory can never happen, thus our call to
        // `self.0.add_signature()` should never fail.
        self.0
            .add_signature(signature)
            .expect("adding a valid signature should never fail")
            .into()
    }
}

#[cfg(test)]
mod tests {
    use crate::{keys::SaplingKey, transaction::UnsignedTransaction};
    use hex_literal::hex;
    use wasm_bindgen_test::wasm_bindgen_test;

    // Transaction copied from one of the fixtures in the `ironfish` NodeJS package
    const TEST_TRANSACTION_BYTES: [u8; 2618] = hex!(
        "01010000000000000003000000000000000100000000000000010000000000000000000000000000000a000000\
        102563f7d98139b32bfe74511adf57e9335bd89cdb820ac0c3a60aebd7c95dcb9f68a3045e995f5f42ab5070a9a\
        9e5d5ae0573256f8159ca18b2ecebb407b7059f68a3045e995f5f42ab5070a9a9e5d5ae0573256f8159ca18b2ec\
        ebb407b7058ba526ccc7064d8d2b8b722883e7d24a0ee96338c49ba860027443810cd533baf9eb95f52bf192b85\
        09fe40bed51551ba0996607bfa1bc4ca40a1ac086b1a7f669fa5a72bac28ba647a7b8f50d17b047d035a1fc36ee\
        aca9f937d0a4dba8d6430c78b497dc511140dd920f72128b58d351509715c4619842fc442888f004630e1d71e57\
        88d02c51662da9d646d5f26b784504420d8a2d52caaca41a7f17875faf5d01cf9054f4a9438bad15a46459ee43e\
        69dd514a92e2f09560265569a177a1722d9343689647a57b518ab4c64451309bed09fa5d7ac194f024ed9a0a63b\
        ff3a5a33c7f04c3490ecd75b320a57e52cd94c2a43f8264625374aafff9b0d099070400000047fd341c51b65906\
        00cf1ad0a7018a03bf838d12d509bbf36196ca99062e768c0000000000000000000000000000000000000000000\
        00000000000000000000000000000000000000000000000000000000000000000000000000000000000008186c5\
        f17408f71c125c6462d1f8c6c1197c5492b2bbbd0d5740c018d40bb4014179746830666426f9b8526d0423e7868\
        4bb9b96907501029c929dad329904032f620e90f144cbbc375401043ebde87f0638a3ce0f951d5469b69ba2963e\
        563b0b075305718763373e8c1a4a91a418de3762ec975f82ffee9c0625822706ed810c3880d078bf31bf8cd6ea4\
        7b26f366189d6ff2b7ac13c717b39d92841a34fbe53e294408b3aa79072c1b601b34e9fc1f2ad572b14a95170cf\
        91c0832dd174d3b918aab0737b545573d34472cd9497c5ea30e478e71e7eefa1541276506d1b3f0431a79f09d8f\
        b7c190ebb1818e310dde6ac00e6dbb7ac24d5aff4c0759ed771d348a216157fe39b06a0f555435a4587df3cbc34\
        88439401d5f7ed118a6b3781065a750d6c58a78b6ddff47e57239e89d1eee98088ebb418aca7cc88d195b11e08e\
        bbddfc376ff1a079c61762bd53a5746cacc027b2fb9ae01f53def998d43eefa2adee358bd5d96c4de17afc05335\
        2749abfeb0d6fd1b54b24bae310930603dd62b72b4307cd96011f74375a6abfc49807a4b1c5a483378aaa70fee1\
        e05323f8909463c69b13c22fee633479caef313eac9081912907d057e279d8ca4e9f5da75f0ed3d8cd3a0b427e8\
        5aa33233f7b9261f4d6e08c601ac9b13786c163432cc64c03d41d96a7ab6a4479cba61ee1f7819ba965dd5d366b\
        d4b9222b0d11255c520620b2f90fb158287efda7444919558fa9133949aa161ac956e8e799b837183709be2afd4\
        71c83677b2aee9b91bd8000aa0ec7923b2181f90994d12a290c33d1ea4f07f8fdf3ecd01b7bcfda7e0bd7a8768a\
        12f6f7888aa82f97b6c3108c051eaec27708ddc777a12caee086fa10b8f4629834e55377d49b4be4a03d7450dca\
        7d4b4c3d29cc37348e98b4d1218694893250d8e3b3c888c88f15155d1604444bf9e478c844ba816fe3479f25d75\
        44dbb5c27a76330f64c0abdf13faf5eccb8693ab52b57f32bfe7213eb6c357a58fd5e2574cb9b1f248172ef6d42\
        bf49c76124f2d74537399dba7351bf767dbb62dbb212bf8341beeafdd05c7c4554afbcbe71c3dde590c78dee04f\
        2adedea7f32dd39696e3b7401e65d8b8c7e02e7513241b31c93865207b52117c25a13391234bf938b56c081b16f\
        500a412f9a311c2c634f8ba354e48952279662c69c8f39385b9fa38027cc593b974c055495b8bb05ff4c51d8224\
        981f23d9c29e1e3fb94ab3b0060d3c2ce809293d017eacb782cf9944ee4e8751df878373c388a63f7753bea4dcf\
        8d593b6531391c27c92b418475a92a276790392cce37a21179cc9f187ae10d5f43a77bf4cda7b1de3bbd5b3e38b\
        663879cedfe3c364935982f8cb2b48e123d62c77558c24767bde2ce73901fd475cfb9ab2ef85f1b2405da60105b\
        460cd12fd089922e4492c1f25f4c62d4547b86dc8f32da14f8356466bc9dd737181492b8b8b1451167064d62ef6\
        7713a65e274f84b943a12ee30717ba4ba09e2bfd09f670f7ef968c32f4abc91cc2f15302dcc24ac706eea811448\
        426d880236bdb8ed2277a8a67034d301bcdaaf540fee0d3efbe73d4e64eb7cb88d34aaf4e35622e80513bdeadb7\
        56f8976b636a87ae7613fed5be24f7c607e4654856e5d13d248735f958e0f00fda0a7c9fbf8eb987e45f17d82fe\
        8726794468888d9cf6742c05cc1cdebd3ce7203539928c00afd0fe81851379d4ca7219222f104d475086455882e\
        6cf6bc44318dc8937d59c16e3590ad95403a3186373f6a5077246eb6b35569098a00e2d632936149c626d3410b1\
        97cbf62713c6542e8fd6b89da622fe911bcb3a665eb43d29d7c3eb345aafa99ab4e69e0a58e1310895a508a3330\
        63bdd84113f673e119cc660577f177ed00ed452d22ba8524b099511cd9205f0f6e1eea027543c9751396a159e39\
        4ea60a1a372b5cb02468f1f5ddee54192e44bf7c0aa73afde658bb977d8cf0ff524fb29daaeeb1badaf5ae96713\
        2a59cdbb7104bf556a4ded3ea4a42e7f447c5676ce197eef160b83953c0f124af59bb65216e6e4839d181013b64\
        242c9662a2e31efdd2205106a3eee4a44ff59ce9c4e242399f167fa996dee650671c17bbb9fa49d596895b1f924\
        fa6c59fd66f8ea131676a3e1c34e5f4694254caf30c8cd8f438d88599c55537e56f1917a70c78da5806a501c647\
        f74581f986bbd5430e5d9f68a3045e995f5f42ab5070a9a9e5d5ae0573256f8159ca18b2ecebb407b705b577cee\
        7cab71668d2131e3f595b51d8317f4722329cf75030615742f587402419931626ed9e77bc8ec73b92dc06238ba3\
        3401333ea58f99a6218a066cbb25569fa1607bd53e59e686f9d0e47dcaf1f0b300b64cbe20614f6c700e68f7d5a\
        36d1423546a7194502528a628ed7c8f352d78963d75aac55835592f67a786c09b04ea12c0f32829a03485336b14\
        45c01915ad0089efd5bda231a24a5aec3c556f522e1ba229d8f49d5d0c0e3b3ade304860cfc94b9646e447f6569\
        7942ef669a1837c0fc099c96cbcd7a9982e060339e192293ca432f3acc8e8e42127337b6b798274657374000000\
        0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\
        0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\
        0000000000000000000000000000000000000000000000000000000000000139050000000000000000000000000\
        0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000\
        00000000000000000000000051f33a2f14f92735e562dc658a5639279ddca3d5079a6d1242b2a588a9cbf44c020\
        000000000000015ce919903b7da6ab0326c1637f1a71bbd4d8809230459a10cd07d891c41ef69900ccd78ddf8df\
        9e8ed99df039de2a897d5be4d1d209893bf389fb85fa4a6605"
    );

    // Spender key (Sapling key) that was used to generated the unsigned transaction above
    const TEST_KEY_BYTES: [u8; 32] =
        hex!("4d1dab6a192648aff8517d81a3075aa45a018120c337384447b364200d4a6c5d");

    #[test]
    #[wasm_bindgen_test]
    fn deserialize() {
        let unsigned = UnsignedTransaction::deserialize(TEST_TRANSACTION_BYTES.as_slice())
            .expect("reading transaction should have succeeded");

        assert_eq!(unsigned.fee(), 0);
        assert_eq!(unsigned.expiration(), 10);
        assert_eq!(
            unsigned.randomized_public_key().serialize(),
            hex!("102563f7d98139b32bfe74511adf57e9335bd89cdb820ac0c3a60aebd7c95dcb")
        );
        assert_eq!(
            unsigned.public_key_randomness().to_bytes(),
            hex!("9f68a3045e995f5f42ab5070a9a9e5d5ae0573256f8159ca18b2ecebb407b705")
        );

        assert_eq!(unsigned.spends().len(), 1);
        assert_eq!(unsigned.outputs().len(), 3);
        assert_eq!(unsigned.mints().len(), 1);
        assert_eq!(unsigned.burns().len(), 1);

        for output in unsigned.outputs() {
            output
                .partial_verify()
                .expect("output verification should have succeeded");
        }

        assert_eq!(
            unsigned.transaction_signature_hash().unwrap(),
            hex!("1c688fe5eb775f6d52839bcdfc70985423789d9fda18771e496daf8c6a5df386")
        );
    }

    #[test]
    #[wasm_bindgen_test]
    fn sign() {
        let unsigned = UnsignedTransaction::deserialize(TEST_TRANSACTION_BYTES.as_slice())
            .expect("reading transaction should have succeeded");
        let key = SaplingKey::deserialize(TEST_KEY_BYTES.as_slice())
            .expect("reading key should have succeeded");
        let hash = unsigned.transaction_signature_hash().unwrap();
        let randomized_public_key = unsigned.randomized_public_key();

        let tx = unsigned
            .sign(&key)
            .expect("transaction signing should have succeeded");

        assert_eq!(tx.transaction_signature_hash().unwrap(), hash);
        assert_eq!(
            tx.randomized_public_key().serialize(),
            randomized_public_key.serialize()
        );

        for spend in tx.spends() {
            spend
                .partial_verify()
                .expect("spend partial verification failed");
            spend
                .verify_signature(&hash[..], &randomized_public_key)
                .expect("spend signature verification failed");
        }
        for output in tx.outputs() {
            output
                .partial_verify()
                .expect("output partial verification failed");
        }
        for mint in tx.mints() {
            mint.partial_verify()
                .expect("mint partial verification failed");
            mint.verify_signature(&hash[..], &randomized_public_key)
                .expect("mint signature verification failed");
        }
    }
}
