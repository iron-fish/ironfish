use ironfish_rust::rolling_filter::RollingFilterRs;
use napi::JsBuffer;
use napi_derive::napi;

#[napi(js_name = "RollingFilterRs")]
pub struct NativeRollingFilter {
    inner: RollingFilterRs,
}

#[napi]
impl NativeRollingFilter {
    #[napi(constructor)]
    #[allow(clippy::new_without_default)]
    pub fn new(items: u32, rate: f64) -> Self {
        Self {
            inner: RollingFilterRs::new(Some(items), rate as f32),
        }
    }

    #[napi]
    pub fn add(&mut self, value: JsBuffer) {
        let v = value.into_value().unwrap();
        self.inner.add(v.as_ref())
    }

    #[napi]
    pub fn test(&self, value: JsBuffer) -> bool {
        let v = value.into_value().unwrap();
        self.inner.test(v.as_ref())
    }
}
