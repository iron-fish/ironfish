use ironfish_mpc;

use napi::{Task, Env, Result, JsString};
use napi::bindgen_prelude::*;
use napi_derive::napi;
 
pub struct Contribute {
  input_path: String,
  output_path: String,
}

#[napi]
impl Task for Contribute {
  type Output = String;
  type JsValue = JsString;
 
  fn compute(&mut self) -> Result<Self::Output> {
    Ok(ironfish_mpc::compute(&self.input_path, &self.output_path))
  }
 
  fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
    env.create_string(&output)
  }
}

#[napi]
pub fn contribute(input_path: String, output_path: String) -> AsyncTask<Contribute> {
  AsyncTask::new(Contribute { input_path, output_path })
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
    Ok(ironfish_mpc::verify_transform(&self.params_path, &self.new_params_path))
  }
 
  fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
    env.create_string(&output)
  }
}

#[napi]
pub fn verify_transform(params_path: String, new_params_path: String) -> AsyncTask<VerifyTransform> {
  AsyncTask::new(VerifyTransform { params_path, new_params_path })
}