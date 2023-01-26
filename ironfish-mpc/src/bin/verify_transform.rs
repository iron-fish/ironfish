use ironfish_mpc::verify_transform;

fn main() {
    let hash = verify_transform("params", "new_params").unwrap();

    println!("{}", into_hex(hash.as_ref()));
}

fn into_hex(h: &[u8]) -> String {
    let mut f = String::new();

    for byte in h {
        f += &format!("{:02x}", byte);
    }

    f
}
