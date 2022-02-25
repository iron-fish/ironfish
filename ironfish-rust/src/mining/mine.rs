use byteorder::{BigEndian, WriteBytesExt};

/// returns true if a <= b when treating both as 32 byte big endian numbers.
pub(crate) fn bytes_lte(a: &[u8], b: &[u8]) -> bool {
    for i in 0..32 {
        if a[i] < b[i] {
            return true;
        }
        if a[i] > b[i] {
            return false;
        }
    }

    true
}

fn randomize_header(i: usize, mut header_bytes: &mut [u8]) {
    header_bytes.write_f64::<BigEndian>(i as f64).unwrap();
}

pub(crate) fn mine_batch(
    header_bytes: &mut [u8],
    target: &[u8],
    start: usize,
    step_size: usize,
    batch_size: usize,
) -> Option<usize> {
    let end = start + batch_size;
    for i in (start..end).step_by(step_size) {
        randomize_header(i, header_bytes);
        let hash = blake3::hash(&header_bytes);

        if bytes_lte(hash.as_bytes(), target) {
            return Some(i);
        }
    }
    return None;
}
