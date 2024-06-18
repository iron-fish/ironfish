/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use super::data_type::DataType;
use crate::errors::{IronfishError, IronfishErrorKind};
use byteorder::WriteBytesExt;
use std::io;

#[derive(Clone)]
pub struct DataDescription {
    pub(crate) data_type: DataType,
    pub(crate) data: Vec<u8>,
}

impl DataDescription {
    pub fn new(data_type: DataType, data: Vec<u8>) -> Result<DataDescription, IronfishError> {
        let description = Self { data_type, data };

        Ok(description)
    }

    pub fn read<R: io::Read>(mut reader: R) -> Result<Self, IronfishError> {
        let mut data_type_buf = [0; 1];
        reader.read_exact(&mut data_type_buf)?;
        let data_type = data_type_buf[0];

        let mut data_len_buf = [0; 4];
        reader.read_exact(&mut data_len_buf)?;
        let data_len = u32::from_le_bytes(data_len_buf) as usize;

        let mut data = vec![0; data_len];
        reader.read_exact(&mut data)?;

        let description = match DataType::from_u8(data_type) {
            Some(data_type) => Self { data_type, data },
            None => return Err(IronfishError::new(IronfishErrorKind::InvalidDataType)),
        };

        Ok(description)
    }

    pub fn write<W: io::Write>(&self, mut writer: W) -> Result<(), IronfishError> {
        writer.write_u8(u8::from(self.data_type))?;
        writer.write_u32::<byteorder::LittleEndian>(self.data.len() as u32)?;
        writer.write_all(&self.data)?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_data_description() {
        let original_data = vec![1, 2, 3, 4, 5];
        let original_data_type = DataType::Undefined; // Replace with actual DataType variant

        // Create a DataDescription instance
        let original_description =
            DataDescription::new(original_data_type, original_data.clone()).unwrap();

        // Write the DataDescription to a Vec<u8>
        let mut buffer = Vec::new();
        original_description.write(&mut buffer).unwrap();

        // Read the DataDescription back from the Vec<u8>
        let read_description = DataDescription::read(&buffer[..]).unwrap();

        // Check that the read data is the same as the original data
        assert_eq!(read_description.data, original_data);
        assert_eq!(read_description.data_type, original_data_type);
    }
}
