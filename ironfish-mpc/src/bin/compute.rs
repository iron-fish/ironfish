use ironfish_mpc::compute;

fn main() {
    let hash = compute("params", "new_params", &None).unwrap();

    println!("{}", into_hex(hash.as_ref()));
}

fn into_hex(h: &[u8]) -> String {
    let mut f = String::new();

    for byte in h {
        f += &format!("{:02x}", byte);
    }

    f
}
