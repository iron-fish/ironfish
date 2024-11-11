use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug)]
pub struct IronfishError(ironfish::errors::IronfishError);

impl<T> From<T> for IronfishError
where
    ironfish::errors::IronfishError: From<T>,
{
    fn from(e: T) -> Self {
        Self(ironfish::errors::IronfishError::from(e))
    }
}

impl AsRef<ironfish::errors::IronfishError> for IronfishError {
    fn as_ref(&self) -> &ironfish::errors::IronfishError {
        &self.0
    }
}

impl AsRef<ironfish::errors::IronfishErrorKind> for IronfishError {
    fn as_ref(&self) -> &ironfish::errors::IronfishErrorKind {
        &self.0.kind
    }
}
