//! # zk-SNARK MPCs, made easy.
//!
//! ## Make your circuit
//!
//! Grab the [`bellman`](https://github.com/ebfull/bellman) and
//! [`pairing`](https://github.com/ebfull/pairing) crates. Bellman
//! provides a trait called `Circuit`, which you must implement
//! for your computation.
//!
//! Here's a silly example: proving you know the cube root of
//! a field element.
//!
//! ```rust
//! extern crate pairing;
//! extern crate bellman;
//!
//! use pairing::{Engine, Field};
//! use bellman::{
//!     Circuit,
//!     ConstraintSystem,
//!     SynthesisError,
//! };
//!
//! struct CubeRoot<E: Engine> {
//!     cube_root: Option<E::Fr>
//! }
//!
//! impl<E: Engine> Circuit<E> for CubeRoot<E> {
//!     fn synthesize<CS: ConstraintSystem<E>>(
//!         self,
//!         cs: &mut CS
//!     ) -> Result<(), SynthesisError>
//!     {
//!         // Witness the cube root
//!         let root = cs.alloc(|| "root", || {
//!             self.cube_root.ok_or(SynthesisError::AssignmentMissing)
//!         })?;
//!
//!         // Witness the square of the cube root
//!         let square = cs.alloc(|| "square", || {
//!             self.cube_root
//!                 .ok_or(SynthesisError::AssignmentMissing)
//!                 .map(|mut root| {root.square(); root })
//!         })?;
//!
//!         // Enforce that `square` is root^2
//!         cs.enforce(
//!             || "squaring",
//!             |lc| lc + root,
//!             |lc| lc + root,
//!             |lc| lc + square
//!         );
//!
//!         // Witness the cube, as a public input
//!         let cube = cs.alloc_input(|| "cube", || {
//!             self.cube_root
//!                 .ok_or(SynthesisError::AssignmentMissing)
//!                 .map(|root| {
//!                     let mut tmp = root;
//!                     tmp.square();
//!                     tmp.mul_assign(&root);
//!                     tmp
//!                 })
//!         })?;
//!
//!         // Enforce that `cube` is root^3
//!         // i.e. that `cube` is `root` * `square`
//!         cs.enforce(
//!             || "cubing",
//!             |lc| lc + root,
//!             |lc| lc + square,
//!             |lc| lc + cube
//!         );
//!
//!         Ok(())
//!     }
//! }
//! ```
//!
//! ## Create some proofs
//!
//! Now that we have `CubeRoot<E>` implementing `Circuit`,
//! let's create some parameters and make some proofs.
//!
//! ```rust,ignore
//! extern crate rand;
//!
//! use pairing::bls12_381::{Bls12, Fr};
//! use bellman::groth16::{
//!     generate_random_parameters,
//!     create_random_proof,
//!     prepare_verifying_key,
//!     verify_proof
//! };
//! use rand::{OsRng, Rand};
//!
//! let rng = &mut OsRng::new();
//!
//! // Create public parameters for our circuit
//! let params = {
//!     let circuit = CubeRoot::<Bls12> {
//!         cube_root: None
//!     };
//!
//!     generate_random_parameters::<Bls12, _, _>(
//!         circuit,
//!         rng
//!     ).unwrap()
//! };
//!
//! // Prepare the verifying key for verification
//! let pvk = prepare_verifying_key(&params.vk);
//!
//! // Let's start making proofs!
//! for _ in 0..50 {
//!     // Verifier picks a cube in the field.
//!     // Let's just make a random one.
//!     let root = Fr::rand(rng);
//!     let mut cube = root;
//!     cube.square();
//!     cube.mul_assign(&root);
//!
//!     // Prover gets the cube, figures out the cube
//!     // root, and makes the proof:
//!     let proof = create_random_proof(
//!         CubeRoot::<Bls12> {
//!             cube_root: Some(root)
//!         }, &params, rng
//!     ).unwrap();
//!
//!     // Verifier checks the proof against the cube
//!     assert!(verify_proof(&pvk, &proof, &[cube]).unwrap());
//! }
//! ```
//! ## Creating parameters
//!
//! Notice in the previous example that we created our zk-SNARK
//! parameters by calling `generate_random_parameters`. However,
//! if you wanted you could have called `generate_parameters`
//! with some secret numbers you chose, and kept them for
//! yourself. Given those numbers, you can create false proofs.
//!
//! In order to convince others you didn't, a multi-party
//! computation (MPC) can be used. The MPC has the property that
//! only one participant needs to be honest for the parameters to
//! be secure. This crate (`phase2`) is about creating parameters
//! securely using such an MPC.
//!
//! Let's start by using `phase2` to create some base parameters
//! for our circuit:
//!
//! ```rust,ignore
//! extern crate phase2;
//!
//! let mut params = phase2::MPCParameters::new(CubeRoot {
//!     cube_root: None
//! }).unwrap();
//! ```
//!
//! The first time you try this, it will try to read a file like
//! `phase1radix2m2` from the current directory. You need to grab
//! that from the [Powers of Tau](https://lists.z.cash.foundation/pipermail/zapps-wg/2018/000362.html).
//!
//! These parameters are not safe to use; false proofs can be
//! created for them. Let's contribute some randomness to these
//! parameters.
//!
//! ```rust,ignore
//! // Contribute randomness to the parameters. Remember this hash,
//! // it's how we know our contribution is in the parameters!
//! let hash = params.contribute(rng);
//! ```
//!
//! These parameters are now secure to use, so long as you weren't
//! malicious. That may not be convincing to others, so let them
//! contribute randomness too! `params` can be serialized and sent
//! elsewhere, where they can do the same thing and send new
//! parameters back to you. Only one person needs to be honest for
//! the final parameters to be secure.
//!
//! Once you're done setting up the parameters, you can verify the
//! parameters:
//!
//! ```rust,ignore
//! let contributions = params.verify(CubeRoot {
//!     cube_root: None
//! }).expect("parameters should be valid!");
//!
//! // We need to check the `contributions` to see if our `hash`
//! // is in it (see above, when we first contributed)
//! assert!(phase2::contains_contribution(&contributions, &hash));
//! ```
//!
//! Great, now if you're happy, grab the Groth16 `Parameters` with
//! `params.params()`, so that you can interact with the bellman APIs
//! just as before.

extern crate bellman;
extern crate byteorder;
extern crate pairing;
extern crate rand;
extern crate rand_chacha;

use rayon::prelude::*;

use blake2::{Blake2b512, Digest};

use byteorder::{BigEndian, ReadBytesExt, WriteBytesExt};

use std::{
    fmt,
    fs::File,
    io::{self, BufReader, Error, ErrorKind, Read, Write},
    ops::{AddAssign, Mul},
    sync::Arc,
};

use ff::{Field, PrimeField};

use pairing::PairingCurveAffine;

use group::{Curve, Group, Wnaf};

use rand_chacha::ChaChaRng;

use bellman::{
    groth16::{Parameters, VerifyingKey},
    Circuit, ConstraintSystem, Index, LinearCombination, SynthesisError, Variable,
};

use bls12_381::{Bls12, G1Affine, G1Projective, G2Affine, G2Projective};

use rand::{Rng, SeedableRng};

/// This is our assembly structure that we'll use to synthesize the
/// circuit into a QAP.
struct KeypairAssembly<Scalar: PrimeField> {
    num_inputs: usize,
    num_aux: usize,
    num_constraints: usize,
    at_inputs: Vec<Vec<(Scalar, usize)>>,
    bt_inputs: Vec<Vec<(Scalar, usize)>>,
    ct_inputs: Vec<Vec<(Scalar, usize)>>,
    at_aux: Vec<Vec<(Scalar, usize)>>,
    bt_aux: Vec<Vec<(Scalar, usize)>>,
    ct_aux: Vec<Vec<(Scalar, usize)>>,
}

impl<Scalar: PrimeField> ConstraintSystem<Scalar> for KeypairAssembly<Scalar> {
    type Root = Self;

    fn alloc<F, A, AR>(&mut self, _: A, _: F) -> Result<Variable, SynthesisError>
    where
        F: FnOnce() -> Result<Scalar, SynthesisError>,
        A: FnOnce() -> AR,
        AR: Into<String>,
    {
        // There is no assignment, so we don't even invoke the
        // function for obtaining one.

        let index = self.num_aux;
        self.num_aux += 1;

        self.at_aux.push(vec![]);
        self.bt_aux.push(vec![]);
        self.ct_aux.push(vec![]);

        Ok(Variable::new_unchecked(Index::Aux(index)))
    }

    fn alloc_input<F, A, AR>(&mut self, _: A, _: F) -> Result<Variable, SynthesisError>
    where
        F: FnOnce() -> Result<Scalar, SynthesisError>,
        A: FnOnce() -> AR,
        AR: Into<String>,
    {
        // There is no assignment, so we don't even invoke the
        // function for obtaining one.

        let index = self.num_inputs;
        self.num_inputs += 1;

        self.at_inputs.push(vec![]);
        self.bt_inputs.push(vec![]);
        self.ct_inputs.push(vec![]);

        Ok(Variable::new_unchecked(Index::Input(index)))
    }

    fn enforce<A, AR, LA, LB, LC>(&mut self, _: A, a: LA, b: LB, c: LC)
    where
        A: FnOnce() -> AR,
        AR: Into<String>,
        LA: FnOnce(LinearCombination<Scalar>) -> LinearCombination<Scalar>,
        LB: FnOnce(LinearCombination<Scalar>) -> LinearCombination<Scalar>,
        LC: FnOnce(LinearCombination<Scalar>) -> LinearCombination<Scalar>,
    {
        fn eval<Scalar: PrimeField>(
            l: LinearCombination<Scalar>,
            inputs: &mut [Vec<(Scalar, usize)>],
            aux: &mut [Vec<(Scalar, usize)>],
            this_constraint: usize,
        ) {
            for &(var, coeff) in l.as_ref() {
                match var.get_unchecked() {
                    Index::Input(id) => inputs[id].push((coeff, this_constraint)),
                    Index::Aux(id) => aux[id].push((coeff, this_constraint)),
                }
            }
        }

        eval(
            a(LinearCombination::zero()),
            &mut self.at_inputs,
            &mut self.at_aux,
            self.num_constraints,
        );
        eval(
            b(LinearCombination::zero()),
            &mut self.bt_inputs,
            &mut self.bt_aux,
            self.num_constraints,
        );
        eval(
            c(LinearCombination::zero()),
            &mut self.ct_inputs,
            &mut self.ct_aux,
            self.num_constraints,
        );

        self.num_constraints += 1;
    }

    fn push_namespace<NR, N>(&mut self, _: N)
    where
        NR: Into<String>,
        N: FnOnce() -> NR,
    {
        // Do nothing; we don't care about namespaces in this context.
    }

    fn pop_namespace(&mut self) {
        // Do nothing; we don't care about namespaces in this context.
    }

    fn get_root(&mut self) -> &mut Self::Root {
        self
    }
}

#[derive(Debug)]
pub struct FailedVerification;

impl fmt::Display for FailedVerification {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "Verification failed")
    }
}

/// MPC parameters are just like bellman `Parameters` except, when serialized,
/// they contain a transcript of contributions at the end, which can be verified.
#[derive(Clone)]
pub struct MPCParameters {
    params: Parameters<Bls12>,
    cs_hash: [u8; 64],
    contributions: Vec<PublicKey>,
}

impl PartialEq for MPCParameters {
    fn eq(&self, other: &MPCParameters) -> bool {
        self.params == other.params
            && self.cs_hash[..] == other.cs_hash[..]
            && self.contributions == other.contributions
    }
}

impl MPCParameters {
    /// Create new Groth16 parameters (compatible with bellman) for a
    /// given circuit. The resulting parameters are unsafe to use
    /// until there are contributions (see `contribute()`).
    pub fn new<C>(circuit: C) -> Result<MPCParameters, SynthesisError>
    where
        C: Circuit<bls12_381::Scalar>,
    {
        let mut assembly: KeypairAssembly<bls12_381::Scalar> = KeypairAssembly {
            num_inputs: 0,
            num_aux: 0,
            num_constraints: 0,
            at_inputs: vec![],
            bt_inputs: vec![],
            ct_inputs: vec![],
            at_aux: vec![],
            bt_aux: vec![],
            ct_aux: vec![],
        };

        // Allocate the "one" input variable
        assembly.alloc_input(|| "", || Ok(bls12_381::Scalar::one()))?;

        // Synthesize the circuit.
        circuit.synthesize(&mut assembly)?;

        // Input constraints to ensure full density of IC query
        // x * 0 = 0
        for i in 0..assembly.num_inputs {
            assembly.enforce(
                || "",
                |lc| lc + Variable::new_unchecked(Index::Input(i)),
                |lc| lc,
                |lc| lc,
            );
        }

        // Compute the size of our evaluation domain
        let mut m = 1;
        let mut exp = 0;
        while m < assembly.num_constraints {
            m *= 2;
            exp += 1;

            // Powers of Tau ceremony can't support more than 2^21
            if exp > 21 {
                return Err(SynthesisError::PolynomialDegreeTooLarge);
            }
        }

        // Try to load "phase1radix2m{}"
        let f = match File::open(format!("phase1radix2m{}", exp)) {
            Ok(f) => f,
            Err(e) => {
                panic!("Couldn't load phase1radix2m{}: {:?}", exp, e);
            }
        };
        let f = &mut BufReader::with_capacity(1024 * 1024, f);

        let read_g1 = |reader: &mut BufReader<File>| -> io::Result<G1Affine> {
            let mut byte_buffer: [u8; 96] = [0u8; 96];
            reader.read_exact(byte_buffer.as_mut())?;

            let point = bls12_381::G1Affine::from_uncompressed(&byte_buffer)
                .unwrap_or_else(G1Affine::identity);

            if bool::from(point.is_identity()) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "point at infinity",
                ));
            }

            Ok(point)
        };

        let read_g2 = |reader: &mut BufReader<File>| -> io::Result<G2Affine> {
            let mut byte_buffer: [u8; 192] = [0u8; 192];
            reader.read_exact(byte_buffer.as_mut())?;

            let point = bls12_381::G2Affine::from_uncompressed(&byte_buffer)
                .unwrap_or_else(G2Affine::identity);

            if bool::from(point.is_identity()) {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidData,
                    "point at infinity",
                ));
            }

            Ok(point)
        };

        let alpha = read_g1(f)?;
        let beta_g1 = read_g1(f)?;
        let beta_g2 = read_g2(f)?;

        let mut coeffs_g1 = Vec::with_capacity(m);
        for _ in 0..m {
            coeffs_g1.push(read_g1(f)?);
        }

        let mut coeffs_g2 = Vec::with_capacity(m);
        for _ in 0..m {
            coeffs_g2.push(read_g2(f)?);
        }

        let mut alpha_coeffs_g1 = Vec::with_capacity(m);
        for _ in 0..m {
            alpha_coeffs_g1.push(read_g1(f)?);
        }

        let mut beta_coeffs_g1 = Vec::with_capacity(m);
        for _ in 0..m {
            beta_coeffs_g1.push(read_g1(f)?);
        }

        let mut h = Vec::with_capacity(m - 1);
        for _ in 0..(m - 1) {
            h.push(read_g1(f)?);
        }

        // TODO: Decide whether we should do computations on G1Projective of G1Affine (one is probably faster)
        let mut ic = vec![G1Projective::identity(); assembly.num_inputs];
        let mut l = vec![G1Projective::identity(); assembly.num_aux];
        let mut a_g1 = vec![G1Projective::identity(); assembly.num_inputs + assembly.num_aux];
        let mut b_g1 = vec![G1Projective::identity(); assembly.num_inputs + assembly.num_aux];
        let mut b_g2 = vec![G2Projective::identity(); assembly.num_inputs + assembly.num_aux];

        #[allow(clippy::too_many_arguments)]
        fn eval(
            // Lagrange coefficients for tau
            coeffs_g1: &[G1Affine],
            coeffs_g2: &[G2Affine],
            alpha_coeffs_g1: &[G1Affine],
            beta_coeffs_g1: &[G1Affine],

            // QAP polynomials
            at: &[Vec<(bls12_381::Scalar, usize)>],
            bt: &[Vec<(bls12_381::Scalar, usize)>],
            ct: &[Vec<(bls12_381::Scalar, usize)>],

            // Resulting evaluated QAP polynomials
            a_g1: &mut [G1Projective],
            b_g1: &mut [G1Projective],
            b_g2: &mut [G2Projective],
            ext: &mut [G1Projective],
        ) {
            // Sanity check
            assert_eq!(a_g1.len(), at.len());
            assert_eq!(a_g1.len(), bt.len());
            assert_eq!(a_g1.len(), ct.len());
            assert_eq!(a_g1.len(), b_g1.len());
            assert_eq!(a_g1.len(), b_g2.len());
            assert_eq!(a_g1.len(), ext.len());

            (at, a_g1).into_par_iter().for_each(|(at, a_g1)| {
                let ag1_coeffs = at.par_iter().map(|&(coeff, lag)| coeffs_g1[lag].mul(coeff));
                let agc_result: G1Projective = ag1_coeffs.sum();
                a_g1.add_assign(&agc_result);
            });

            (bt, b_g1, b_g2)
                .into_par_iter()
                .for_each(|(bt, b_g1, b_g2)| {
                    // b_g1
                    let bg1_coeffs = bt.par_iter().map(|&(coeff, lag)| coeffs_g1[lag].mul(coeff));
                    let bg1_result: G1Projective = bg1_coeffs.sum();
                    b_g1.add_assign(&bg1_result);

                    // b_g2
                    let bg2_coeffs = bt.par_iter().map(|&(coeff, lag)| coeffs_g2[lag].mul(coeff));
                    let bg2_result: G2Projective = bg2_coeffs.sum();
                    b_g2.add_assign(&bg2_result);
                });

            (at, bt, ct, ext)
                .into_par_iter()
                .for_each(|(at, bt, ct, ext)| {
                    let ext_at = at
                        .par_iter()
                        .map(|&(coeff, lag)| beta_coeffs_g1[lag].mul(coeff));
                    let ext_bt = bt
                        .par_iter()
                        .map(|&(coeff, lag)| alpha_coeffs_g1[lag].mul(coeff));
                    let ext_ct = ct.par_iter().map(|&(coeff, lag)| coeffs_g1[lag].mul(coeff));
                    let ext_chained: G1Projective = ext_at.chain(ext_bt).chain(ext_ct).sum();
                    ext.add_assign(ext_chained);
                });
        }

        // Evaluate for inputs.
        eval(
            &coeffs_g1,
            &coeffs_g2,
            &alpha_coeffs_g1,
            &beta_coeffs_g1,
            &assembly.at_inputs,
            &assembly.bt_inputs,
            &assembly.ct_inputs,
            &mut a_g1[0..assembly.num_inputs],
            &mut b_g1[0..assembly.num_inputs],
            &mut b_g2[0..assembly.num_inputs],
            &mut ic,
        );

        // Evaluate for auxiliary variables.
        eval(
            &coeffs_g1,
            &coeffs_g2,
            &alpha_coeffs_g1,
            &beta_coeffs_g1,
            &assembly.at_aux,
            &assembly.bt_aux,
            &assembly.ct_aux,
            &mut a_g1[assembly.num_inputs..],
            &mut b_g1[assembly.num_inputs..],
            &mut b_g2[assembly.num_inputs..],
            &mut l,
        );

        // Don't allow any elements be unconstrained, so that
        // the L query is always fully dense.
        for e in l.iter() {
            if bool::from(e.is_identity()) {
                return Err(SynthesisError::UnconstrainedVariable);
            }
        }

        let mut ic_affine = vec![G1Affine::identity(); assembly.num_inputs];
        G1Projective::batch_normalize(&ic[..], &mut ic_affine[..]);

        let mut l_affine = vec![G1Affine::identity(); assembly.num_aux];
        G1Projective::batch_normalize(&l[..], &mut l_affine[..]);

        let mut a_g1_affine = vec![G1Affine::identity(); assembly.num_inputs + assembly.num_aux];
        G1Projective::batch_normalize(&a_g1[..], &mut a_g1_affine[..]);

        let mut b_g1_affine = vec![G1Affine::identity(); assembly.num_inputs + assembly.num_aux];
        G1Projective::batch_normalize(&b_g1[..], &mut b_g1_affine[..]);

        let mut b_g2_affine = vec![G2Affine::identity(); assembly.num_inputs + assembly.num_aux];
        G2Projective::batch_normalize(&b_g2[..], &mut b_g2_affine[..]);

        let vk = VerifyingKey {
            alpha_g1: alpha,
            beta_g1,
            beta_g2,
            gamma_g2: G2Affine::generator(),
            delta_g1: G1Affine::generator(),
            delta_g2: G2Affine::generator(),
            ic: ic_affine,
        };

        let params = Parameters {
            vk,
            h: Arc::new(h),
            l: Arc::new(l_affine),

            // Filter points at infinity away from A/B queries
            a: Arc::new(
                a_g1_affine
                    .into_iter()
                    .filter(|e| !bool::from(e.is_identity()))
                    .collect(),
            ),
            b_g1: Arc::new(
                b_g1_affine
                    .into_iter()
                    .filter(|e| !bool::from(e.is_identity()))
                    .collect(),
            ),
            b_g2: Arc::new(
                b_g2_affine
                    .into_iter()
                    .filter(|e| !bool::from(e.is_identity()))
                    .collect(),
            ),
        };

        let h = {
            let sink = io::sink();
            let mut sink = HashWriter::new(sink);

            params.write(&mut sink).unwrap();

            sink.into_hash()
        };

        let mut cs_hash = [0; 64];
        cs_hash.copy_from_slice(h.as_ref());

        Ok(MPCParameters {
            params,
            cs_hash,
            contributions: vec![],
        })
    }

    /// Get the underlying Groth16 `Parameters`
    pub fn get_params(&self) -> &Parameters<Bls12> {
        &self.params
    }

    /// Contributes some randomness to the parameters. Only one
    /// contributor needs to be honest for the parameters to be
    /// secure.
    ///
    /// This function returns a "hash" that is bound to the
    /// contribution. Contributors can use this hash to make
    /// sure their contribution is in the final parameters, by
    /// checking to see if it appears in the output of
    /// `MPCParameters::verify`.
    pub fn contribute<R: rand::RngCore>(&mut self, rng: &mut R) -> [u8; 64] {
        // Generate a keypair
        let (pubkey, privkey) = keypair(rng, self);

        fn batch_exp(bases: &mut [G1Affine], coeff: bls12_381::Scalar) {
            bases.par_iter_mut().for_each(|base| {
                let mut wnaf = Wnaf::new();

                *base = G1Affine::from(wnaf.base(G1Projective::from(*base), 1).scalar(&coeff));
            });
        }

        let delta_inv = privkey.delta.invert().unwrap();
        let mut l = (self.params.l[..]).to_vec();
        let mut h = (self.params.h[..]).to_vec();
        batch_exp(&mut l, delta_inv);
        batch_exp(&mut h, delta_inv);
        self.params.l = Arc::new(l);
        self.params.h = Arc::new(h);

        self.params.vk.delta_g1 = self.params.vk.delta_g1.mul(privkey.delta).to_affine();
        self.params.vk.delta_g2 = self.params.vk.delta_g2.mul(privkey.delta).to_affine();

        self.contributions.push(pubkey.clone());

        // Calculate the hash of the public key and return it
        {
            let sink = io::sink();
            let mut sink = HashWriter::new(sink);
            pubkey.write(&mut sink).unwrap();
            let h = sink.into_hash();
            let mut response = [0u8; 64];
            response.copy_from_slice(h.as_ref());
            response
        }
    }

    /// Verify the correctness of the parameters, given a circuit
    /// instance. This will return all of the hashes that
    /// contributors obtained when they ran
    /// `MPCParameters::contribute`, for ensuring that contributions
    /// exist in the final parameters.
    pub fn verify<C: Circuit<bls12_381::Scalar>>(
        &self,
        circuit: C,
    ) -> Result<Vec<[u8; 64]>, FailedVerification> {
        let initial_params = MPCParameters::new(circuit).map_err(|_| FailedVerification)?;

        // H/L will change, but should have same length
        if initial_params.params.h.len() != self.params.h.len() {
            return Err(FailedVerification);
        }
        if initial_params.params.l.len() != self.params.l.len() {
            return Err(FailedVerification);
        }

        // A/B_G1/B_G2 doesn't change at all
        if initial_params.params.a != self.params.a {
            return Err(FailedVerification);
        }
        if initial_params.params.b_g1 != self.params.b_g1 {
            return Err(FailedVerification);
        }
        if initial_params.params.b_g2 != self.params.b_g2 {
            return Err(FailedVerification);
        }

        // alpha/beta/gamma don't change
        if initial_params.params.vk.alpha_g1 != self.params.vk.alpha_g1 {
            return Err(FailedVerification);
        }
        if initial_params.params.vk.beta_g1 != self.params.vk.beta_g1 {
            return Err(FailedVerification);
        }
        if initial_params.params.vk.beta_g2 != self.params.vk.beta_g2 {
            return Err(FailedVerification);
        }
        if initial_params.params.vk.gamma_g2 != self.params.vk.gamma_g2 {
            return Err(FailedVerification);
        }

        // IC shouldn't change, as gamma doesn't change
        if initial_params.params.vk.ic != self.params.vk.ic {
            return Err(FailedVerification);
        }

        // cs_hash should be the same
        if initial_params.cs_hash[..] != self.cs_hash[..] {
            return Err(FailedVerification);
        }

        let sink = io::sink();
        let mut sink = HashWriter::new(sink);
        sink.write_all(&initial_params.cs_hash[..]).unwrap();

        let mut current_delta = G1Affine::generator();
        let mut result = vec![];

        for pubkey in &self.contributions {
            let mut our_sink = sink.clone();
            our_sink
                .write_all(pubkey.s.to_uncompressed().as_ref())
                .unwrap();
            our_sink
                .write_all(pubkey.s_delta.to_uncompressed().as_ref())
                .unwrap();

            pubkey.write(&mut sink).unwrap();

            let h = our_sink.into_hash();

            // The transcript must be consistent
            if &pubkey.transcript[..] != h.as_ref() {
                return Err(FailedVerification);
            }

            let r = hash_to_g2(h.as_ref());

            // Check the signature of knowledge
            if !same_ratio((r, pubkey.r_delta), (pubkey.s, pubkey.s_delta)) {
                return Err(FailedVerification);
            }

            // Check the change from the old delta is consistent
            if !same_ratio((current_delta, pubkey.delta_after), (r, pubkey.r_delta)) {
                return Err(FailedVerification);
            }

            current_delta = pubkey.delta_after;

            {
                let sink = io::sink();
                let mut sink = HashWriter::new(sink);
                pubkey.write(&mut sink).unwrap();
                let h = sink.into_hash();
                let mut response = [0u8; 64];
                response.copy_from_slice(h.as_ref());
                result.push(response);
            }
        }

        // Current parameters should have consistent delta in G1
        if current_delta != self.params.vk.delta_g1 {
            return Err(FailedVerification);
        }

        // Current parameters should have consistent delta in G2
        if !same_ratio(
            (G1Affine::generator(), current_delta),
            (G2Affine::generator(), self.params.vk.delta_g2),
        ) {
            return Err(FailedVerification);
        }

        // H and L queries should be updated with delta^-1
        if !same_ratio(
            merge_pairs(&initial_params.params.h, &self.params.h),
            (self.params.vk.delta_g2, G2Affine::generator()), // reversed for inverse
        ) {
            return Err(FailedVerification);
        }

        if !same_ratio(
            merge_pairs(&initial_params.params.l, &self.params.l),
            (self.params.vk.delta_g2, G2Affine::generator()), // reversed for inverse
        ) {
            return Err(FailedVerification);
        }

        Ok(result)
    }

    /// Serialize these parameters. The serialized parameters
    /// can be read by bellman as Groth16 `Parameters`.
    pub fn write<W: Write>(&self, mut writer: W) -> io::Result<()> {
        self.params.write(&mut writer)?;
        writer.write_all(&self.cs_hash)?;

        writer.write_u32::<BigEndian>(self.contributions.len() as u32)?;
        for pubkey in &self.contributions {
            pubkey.write(&mut writer)?;
        }

        Ok(())
    }

    /// Deserialize these parameters. If `checked` is false,
    /// we won't perform curve validity and group order
    /// checks.
    pub fn read<R: Read>(mut reader: R, checked: bool) -> io::Result<MPCParameters> {
        // Parameters
        let read_g1 = |reader: &mut R| -> io::Result<[u8; 96]> {
            let mut repr: [u8; 96] = [0u8; 96];
            reader.read_exact(repr.as_mut())?;
            Ok(repr)
        };

        let process_g1 = |repr: &[u8; 96]| -> io::Result<G1Affine> {
            let affine = if checked {
                bls12_381::G1Affine::from_uncompressed(repr)
            } else {
                bls12_381::G1Affine::from_uncompressed_unchecked(repr)
            };

            let affine = if affine.is_some().into() {
                Ok(affine.unwrap())
            } else {
                Err(io::Error::new(io::ErrorKind::InvalidData, "invalid G1"))
            };

            affine.and_then(|e| {
                if e.is_identity().into() {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "point at infinity",
                    ))
                } else {
                    Ok(e)
                }
            })
        };

        let read_g2 = |reader: &mut R| -> io::Result<[u8; 192]> {
            let mut repr: [u8; 192] = [0u8; 192];
            reader.read_exact(repr.as_mut())?;
            Ok(repr)
        };

        let process_g2 = |repr: &[u8; 192]| -> io::Result<G2Affine> {
            let affine = if checked {
                G2Affine::from_uncompressed(repr)
            } else {
                G2Affine::from_uncompressed_unchecked(repr)
            };

            let affine = if affine.is_some().into() {
                Ok(affine.unwrap())
            } else {
                Err(io::Error::new(io::ErrorKind::InvalidData, "invalid G2"))
            };

            affine.and_then(|e| {
                if e.is_identity().into() {
                    Err(io::Error::new(
                        io::ErrorKind::InvalidData,
                        "point at infinity",
                    ))
                } else {
                    Ok(e)
                }
            })
        };

        let vk = VerifyingKey::read(&mut reader)?;

        let h = {
            let len = reader.read_u32::<BigEndian>()? as usize;
            let mut bufs = Vec::with_capacity(len);

            for _ in 0..len {
                bufs.push(read_g1(&mut reader)?);
            }

            let h: Result<_, _> = bufs.par_iter().map(process_g1).collect();
            h
        }?;

        let l = {
            let len = reader.read_u32::<BigEndian>()? as usize;
            let mut bufs = Vec::with_capacity(len);

            for _ in 0..len {
                bufs.push(read_g1(&mut reader)?);
            }

            let l: Result<_, _> = bufs.par_iter().map(process_g1).collect();
            l
        }?;

        let a = {
            let len = reader.read_u32::<BigEndian>()? as usize;
            let mut bufs = Vec::with_capacity(len);

            for _ in 0..len {
                bufs.push(read_g1(&mut reader)?);
            }

            let a: Result<_, _> = bufs.par_iter().map(process_g1).collect();
            a
        }?;

        let b_g1 = {
            let len = reader.read_u32::<BigEndian>()? as usize;
            let mut bufs = Vec::with_capacity(len);

            for _ in 0..len {
                bufs.push(read_g1(&mut reader)?);
            }

            let b_g1: Result<_, _> = bufs.par_iter().map(process_g1).collect();
            b_g1
        }?;

        let b_g2 = {
            let len = reader.read_u32::<BigEndian>()? as usize;
            let mut bufs = Vec::with_capacity(len);

            for _ in 0..len {
                bufs.push(read_g2(&mut reader)?);
            }

            let b_g2: Result<_, _> = bufs.par_iter().map(process_g2).collect();
            b_g2
        }?;

        let params = Parameters {
            vk,
            h: Arc::new(h),
            l: Arc::new(l),
            a: Arc::new(a),
            b_g1: Arc::new(b_g1),
            b_g2: Arc::new(b_g2),
        };

        // Contributions
        let mut cs_hash = [0u8; 64];
        reader.read_exact(&mut cs_hash)?;

        let contributions_len = reader.read_u32::<BigEndian>()? as usize;

        let mut contributions = vec![];
        for _ in 0..contributions_len {
            contributions.push(PublicKey::read(&mut reader)?);
        }

        Ok(MPCParameters {
            params,
            cs_hash,
            contributions,
        })
    }
}

/// This allows others to verify that you contributed. The hash produced
/// by `MPCParameters::contribute` is just a BLAKE2b hash of this object.
#[derive(Clone)]
struct PublicKey {
    /// This is the delta (in G1) after the transformation, kept so that we
    /// can check correctness of the public keys without having the entire
    /// interstitial parameters for each contribution.
    delta_after: G1Affine,

    /// Random element chosen by the contributor.
    s: G1Affine,

    /// That element, taken to the contributor's secret delta.
    s_delta: G1Affine,

    /// r is H(last_pubkey | s | s_delta), r_delta proves knowledge of delta
    r_delta: G2Affine,

    /// Hash of the transcript (used for mapping to r)
    transcript: [u8; 64],
}

impl PublicKey {
    fn write<W: Write>(&self, mut writer: W) -> io::Result<()> {
        writer.write_all(self.delta_after.to_uncompressed().as_ref())?;
        writer.write_all(self.s.to_uncompressed().as_ref())?;
        writer.write_all(self.s_delta.to_uncompressed().as_ref())?;
        writer.write_all(self.r_delta.to_uncompressed().as_ref())?;
        writer.write_all(&self.transcript)?;

        Ok(())
    }

    fn read<R: Read>(mut reader: R) -> io::Result<PublicKey> {
        let mut g1_repr: [u8; 96] = [0u8; 96];
        let mut g2_repr: [u8; 192] = [0u8; 192];

        reader.read_exact(g1_repr.as_mut())?;
        let delta_after = G1Affine::from_uncompressed(&g1_repr).unwrap_or_else(G1Affine::identity);

        if bool::from(delta_after.is_identity()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "point at infinity",
            ));
        }

        reader.read_exact(g1_repr.as_mut())?;
        let s = G1Affine::from_uncompressed(&g1_repr).unwrap_or_else(G1Affine::identity);

        if bool::from(s.is_identity()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "point at infinity",
            ));
        }

        reader.read_exact(g1_repr.as_mut())?;
        let s_delta = G1Affine::from_uncompressed(&g1_repr).unwrap_or_else(G1Affine::identity);

        if bool::from(s_delta.is_identity()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "point at infinity",
            ));
        }

        reader.read_exact(g2_repr.as_mut())?;
        let r_delta = G2Affine::from_uncompressed(&g2_repr).unwrap_or_else(G2Affine::identity);

        if bool::from(r_delta.is_identity()) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "point at infinity",
            ));
        }

        let mut transcript = [0u8; 64];
        reader.read_exact(&mut transcript)?;

        Ok(PublicKey {
            delta_after,
            s,
            s_delta,
            r_delta,
            transcript,
        })
    }
}

impl PartialEq for PublicKey {
    fn eq(&self, other: &PublicKey) -> bool {
        self.delta_after == other.delta_after
            && self.s == other.s
            && self.s_delta == other.s_delta
            && self.r_delta == other.r_delta
            && self.transcript[..] == other.transcript[..]
    }
}

fn failed_contribution_error() -> std::io::Error {
    Error::new(ErrorKind::Other, "Failed to verify contribution")
}

/// Verify a contribution, given the old parameters and
/// the new parameters. Returns the hash of the contribution.
pub fn verify_contribution(
    before: &MPCParameters,
    after: &MPCParameters,
) -> Result<[u8; 64], std::io::Error> {
    // Transformation involves a single new object
    if after.contributions.len() != (before.contributions.len() + 1) {
        return Err(failed_contribution_error());
    }

    // None of the previous transformations should change
    if before.contributions[..] != after.contributions[0..before.contributions.len()] {
        return Err(failed_contribution_error());
    }

    // H/L will change, but should have same length
    if before.params.h.len() != after.params.h.len() {
        return Err(failed_contribution_error());
    }
    if before.params.l.len() != after.params.l.len() {
        return Err(failed_contribution_error());
    }

    // A/B_G1/B_G2 doesn't change at all
    if before.params.a != after.params.a {
        return Err(failed_contribution_error());
    }
    if before.params.b_g1 != after.params.b_g1 {
        return Err(failed_contribution_error());
    }
    if before.params.b_g2 != after.params.b_g2 {
        return Err(failed_contribution_error());
    }

    // alpha/beta/gamma don't change
    if before.params.vk.alpha_g1 != after.params.vk.alpha_g1 {
        return Err(failed_contribution_error());
    }
    if before.params.vk.beta_g1 != after.params.vk.beta_g1 {
        return Err(failed_contribution_error());
    }
    if before.params.vk.beta_g2 != after.params.vk.beta_g2 {
        return Err(failed_contribution_error());
    }
    if before.params.vk.gamma_g2 != after.params.vk.gamma_g2 {
        return Err(failed_contribution_error());
    }

    // IC shouldn't change, as gamma doesn't change
    if before.params.vk.ic != after.params.vk.ic {
        return Err(failed_contribution_error());
    }

    // cs_hash should be the same
    if before.cs_hash[..] != after.cs_hash[..] {
        return Err(failed_contribution_error());
    }

    let sink = io::sink();
    let mut sink = HashWriter::new(sink);
    sink.write_all(&before.cs_hash[..])?;

    for pubkey in &before.contributions {
        pubkey.write(&mut sink)?;
    }

    let pubkey = after
        .contributions
        .last()
        .ok_or_else(failed_contribution_error)?;
    sink.write_all(pubkey.s.to_uncompressed().as_ref())?;
    sink.write_all(pubkey.s_delta.to_uncompressed().as_ref())?;

    let h = sink.into_hash();

    // The transcript must be consistent
    if &pubkey.transcript[..] != h.as_ref() {
        return Err(failed_contribution_error());
    }

    let r = hash_to_g2(h.as_ref());

    // Check the signature of knowledge
    if !same_ratio((r, pubkey.r_delta), (pubkey.s, pubkey.s_delta)) {
        return Err(failed_contribution_error());
    }

    // Check the change from the old delta is consistent
    if !same_ratio(
        (before.params.vk.delta_g1, pubkey.delta_after),
        (r, pubkey.r_delta),
    ) {
        return Err(failed_contribution_error());
    }

    // Current parameters should have consistent delta in G1
    if pubkey.delta_after != after.params.vk.delta_g1 {
        return Err(failed_contribution_error());
    }

    // Current parameters should have consistent delta in G2
    if !same_ratio(
        (G1Affine::generator(), pubkey.delta_after),
        (G2Affine::generator(), after.params.vk.delta_g2),
    ) {
        return Err(failed_contribution_error());
    }

    // H and L queries should be updated with delta^-1
    if !same_ratio(
        merge_pairs(&before.params.h, &after.params.h),
        (after.params.vk.delta_g2, before.params.vk.delta_g2), // reversed for inverse
    ) {
        return Err(failed_contribution_error());
    }

    if !same_ratio(
        merge_pairs(&before.params.l, &after.params.l),
        (after.params.vk.delta_g2, before.params.vk.delta_g2), // reversed for inverse
    ) {
        return Err(failed_contribution_error());
    }

    let sink = io::sink();
    let mut sink = HashWriter::new(sink);
    pubkey.write(&mut sink)?;
    let h = sink.into_hash();
    let mut response = [0u8; 64];
    response.copy_from_slice(h.as_ref());

    Ok(response)
}

/// Checks if pairs have the same ratio.
fn same_ratio<G1: PairingCurveAffine>(g1: (G1, G1), g2: (G1::Pair, G1::Pair)) -> bool {
    g1.0.pairing_with(&g2.1) == g1.1.pairing_with(&g2.0)
}

/// Computes a random linear combination over v1/v2.
///
/// Checking that many pairs of elements are exponentiated by
/// the same `x` can be achieved (with high probability) with
/// the following technique:
///
/// Given v1 = [a, b, c] and v2 = [as, bs, cs], compute
/// (a*r1 + b*r2 + c*r3, (as)*r1 + (bs)*r2 + (cs)*r3) for some
/// random r1, r2, r3. Given (g, g^s)...
///
/// e(g, (as)*r1 + (bs)*r2 + (cs)*r3) = e(g^s, a*r1 + b*r2 + c*r3)
///
/// ... with high probability.
fn merge_pairs(v1: &[G1Affine], v2: &[G1Affine]) -> (G1Affine, G1Affine) {
    use rand::thread_rng;

    assert_eq!(v1.len(), v2.len());

    let result = (v1, v2)
        .into_par_iter()
        .map(|(&v1, &v2)| {
            // We do not need to be overly cautious of the RNG
            // used for this check.
            let rng = &mut thread_rng();
            let rho = bls12_381::Scalar::random(&mut *rng);
            let mut new_wnaf = Wnaf::new();
            let mut wnaf = new_wnaf.scalar(&rho);
            (
                wnaf.base(G1Projective::from(v1)),
                wnaf.base(G1Projective::from(v2)),
            )
        })
        .reduce(
            || (G1Projective::identity(), G1Projective::identity()),
            |a, b| (a.0 + b.0, a.1 + b.1),
        );

    (result.0.to_affine(), result.1.to_affine())
}

/// This needs to be destroyed by at least one participant
/// for the final parameters to be secure.
struct PrivateKey {
    delta: bls12_381::Scalar,
}

/// Compute a keypair, given the current parameters. Keypairs
/// cannot be reused for multiple contributions or contributions
/// in different parameters.
fn keypair<R: Rng>(rng: &mut R, current: &MPCParameters) -> (PublicKey, PrivateKey) {
    // Sample random delta
    let delta: bls12_381::Scalar = bls12_381::Scalar::random(&mut *rng);

    // Compute delta s-pair in G1
    let s: G1Affine = G1Affine::from(G1Projective::random(rng));
    let s_delta = G1Affine::from(s.mul(delta));

    // H(cs_hash | <previous pubkeys> | s | s_delta)
    let h = {
        let sink = io::sink();
        let mut sink = HashWriter::new(sink);

        sink.write_all(&current.cs_hash[..]).unwrap();
        for pubkey in &current.contributions {
            pubkey.write(&mut sink).unwrap();
        }
        sink.write_all(s.to_uncompressed().as_ref()).unwrap();
        sink.write_all(s_delta.to_uncompressed().as_ref()).unwrap();

        sink.into_hash()
    };

    // This avoids making a weird assumption about the hash into the
    // group.
    let mut transcript = [0; 64];
    transcript.copy_from_slice(h.as_ref());

    // Compute delta s-pair in G2
    let r = hash_to_g2(h.as_ref());
    let r_delta = G2Affine::from(r.mul(delta));

    (
        PublicKey {
            delta_after: G1Affine::from(current.params.vk.delta_g1.mul(delta)),
            s,
            s_delta,
            r_delta,
            transcript,
        },
        PrivateKey { delta },
    )
}

/// Hashes to G2 using the first 32 bytes of `digest`. Panics if `digest` is less
/// than 32 bytes.
fn hash_to_g2(digest: &[u8]) -> G2Affine {
    assert!(digest.len() >= 32);

    let digest_32: [u8; 32] = digest[..32].try_into().unwrap();

    G2Affine::from(G2Projective::random(ChaChaRng::from_seed(digest_32)))
}

/// Abstraction over a writer which hashes the data being written.
struct HashWriter<W: Write> {
    writer: W,
    hasher: Blake2b512,
}

impl Clone for HashWriter<io::Sink> {
    fn clone(&self) -> HashWriter<io::Sink> {
        HashWriter {
            writer: io::sink(),
            hasher: self.hasher.clone(),
        }
    }
}

impl<W: Write> HashWriter<W> {
    /// Construct a new `HashWriter` given an existing `writer` by value.
    pub fn new(writer: W) -> Self {
        HashWriter {
            writer,
            hasher: Blake2b512::new(),
        }
    }

    /// Destroy this writer and return the hash of what was written.
    pub fn into_hash(self) -> [u8; 64] {
        let mut tmp = [0u8; 64];
        tmp.copy_from_slice(self.hasher.finalize().as_ref());
        tmp
    }
}

impl<W: Write> Write for HashWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let bytes = self.writer.write(buf)?;

        if bytes > 0 {
            self.hasher.update(&buf[0..bytes]);
        }

        Ok(bytes)
    }

    fn flush(&mut self) -> io::Result<()> {
        self.writer.flush()
    }
}

/// This is a cheap helper utility that exists purely
/// because Rust still doesn't have type-level integers
/// and so doesn't implement `PartialEq` for `[T; 64]`
pub fn contains_contribution(contributions: &[[u8; 64]], my_contribution: &[u8; 64]) -> bool {
    for contrib in contributions {
        if contrib[..] == my_contribution[..] {
            return true;
        }
    }

    false
}
