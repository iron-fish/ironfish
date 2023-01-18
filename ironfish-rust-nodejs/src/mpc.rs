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