use ironfish_mpc::verify_transform;

fn main() {
    let hash = verify_transform("params", "new_params").unwrap();

    println!("{}", hash);
}
