/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use crate::errors::IronfishError;
use ironfish::errors::IronfishErrorKind;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Copy, Clone, PartialEq, Eq, Debug)]
pub enum Language {
    English,
    ChineseSimplified,
    ChineseTraditional,
    French,
    Italian,
    Japanese,
    Korean,
    Spanish,
}

impl From<bip39::Language> for Language {
    fn from(x: bip39::Language) -> Self {
        match x {
            bip39::Language::English => Self::English,
            bip39::Language::ChineseSimplified => Self::ChineseSimplified,
            bip39::Language::ChineseTraditional => Self::ChineseTraditional,
            bip39::Language::French => Self::French,
            bip39::Language::Italian => Self::Italian,
            bip39::Language::Japanese => Self::Japanese,
            bip39::Language::Korean => Self::Korean,
            bip39::Language::Spanish => Self::Spanish,
        }
    }
}

impl From<Language> for bip39::Language {
    fn from(x: Language) -> Self {
        match x {
            Language::English => Self::English,
            Language::ChineseSimplified => Self::ChineseSimplified,
            Language::ChineseTraditional => Self::ChineseTraditional,
            Language::French => Self::French,
            Language::Italian => Self::Italian,
            Language::Japanese => Self::Japanese,
            Language::Korean => Self::Korean,
            Language::Spanish => Self::Spanish,
        }
    }
}

impl Language {
    pub fn from_language_code(code: &str) -> Result<Self, IronfishError> {
        // These are the same language codes used by `bip39`
        match code {
            "en" => Ok(Self::English),
            "zh-hans" => Ok(Self::ChineseSimplified),
            "zh-hant" => Ok(Self::ChineseTraditional),
            "fr" => Ok(Self::French),
            "it" => Ok(Self::Italian),
            "ja" => Ok(Self::Japanese),
            "ko" => Ok(Self::Korean),
            "es" => Ok(Self::Spanish),
            _ => Err(IronfishErrorKind::InvalidLanguageEncoding.into()),
        }
    }

    pub fn language_code(self) -> String {
        // These are the same language codes used by `bip39`
        match self {
            Self::English => "en",
            Self::ChineseSimplified => "zh-hans",
            Self::ChineseTraditional => "zh-hant",
            Self::French => "fr",
            Self::Italian => "it",
            Self::Japanese => "ja",
            Self::Korean => "ko",
            Self::Spanish => "es",
        }
        .to_string()
    }
}
