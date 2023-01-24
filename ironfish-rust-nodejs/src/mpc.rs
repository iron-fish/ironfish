use ironfish_mpc;

use napi::bindgen_prelude::*;
use napi::{Env, JsString, Result, Task};
use napi_derive::napi;

use crate::to_napi_err;

pub struct Contribute {
    input_path: String,
    output_path: String,
    seed: Option<String>,
}

#[napi]
impl Task for Contribute {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> Result<Self::Output> {
        ironfish_mpc::compute(&self.input_path, &self.output_path, &self.seed).map_err(to_napi_err)
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.create_string(&output)
    }
}

#[napi]
pub fn contribute(
    input_path: String,
    output_path: String,
    seed: Option<String>,
) -> AsyncTask<Contribute> {
    AsyncTask::new(Contribute {
        input_path,
        output_path,
        seed,
    })
}

pub struct VerifyTransform {
    params_path: String,
    new_params_path: String,
}

#[napi]
impl Task for VerifyTransform {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> Result<Self::Output> {
        ironfish_mpc::verify_transform(&self.params_path, &self.new_params_path)
            .map_err(to_napi_err)
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.create_string(&output)
    }
}

#[napi]
pub fn verify_transform(
    params_path: String,
    new_params_path: String,
) -> AsyncTask<VerifyTransform> {
    AsyncTask::new(VerifyTransform {
        params_path,
        new_params_path,
    })
}
