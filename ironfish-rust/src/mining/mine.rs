use byteorder::{BigEndian, WriteBytesExt};

// TODO: allow this to be configured
pub(crate) const BATCH_SIZE: usize = 10_000;

// TODO: dedupe these fns
fn bytes_lte(a: &[u8], b: &[u8]) -> bool {
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
) -> Option<usize> {
    let end = start + BATCH_SIZE;
    for i in (start..end).step_by(step_size) {
        randomize_header(i, header_bytes);
        let hash = blake3::hash(&header_bytes);

        if bytes_lte(hash.as_bytes(), target) {
            return Some(i);
        }
    }
    return None;
}