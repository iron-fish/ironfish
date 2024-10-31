use sha2::Digest;
use sha2::Sha512;
use std::env;
use std::fs;
use std::io;
use std::io::BufRead;
use std::io::BufReader;
use std::path::Path;
use std::path::PathBuf;

fn copy_if_present(src: &Path, dst: &Path) {
    if let Err(err) = fs::copy(src, dst) {
        match err.kind() {
            // If the source file is not found, it's fine to keep going: `fetch_if_missing` will
            // download it later
            io::ErrorKind::NotFound => (),
            // All other errors should block the build
            err => panic!(
                "failed to copy {} to {}: {}",
                src.display(),
                dst.display(),
                err
            ),
        }
    }
}

#[cfg(not(feature = "download-params"))]
fn fetch_if_missing(_dst: &Path) {}

#[cfg(feature = "download-params")]
fn fetch_if_missing(dst: &Path) {
    if dst.exists() {
        return;
    }

    let name = dst.file_name().unwrap().to_str().unwrap();

    println!("cargo:warning=fetching {name} from GitHub");

    // Fetch the contents to a temporary file and then, if the download was successful, rename the
    // temporary file to the final destination. This ensures that partial/failed downloads do not
    // leave incomplete files around.
    let tmp = dst.with_file_name(format!("{name}.part"));
    let mut file = fs::OpenOptions::new()
        .write(true)
        .create(true)
        .open(&tmp)
        .unwrap_or_else(|err| panic!("failed to open {}: {}", tmp.display(), err));
    let url = format!(
        "https://github.com/iron-fish/ironfish/raw/master/ironfish-rust/src/sapling_params/{}",
        name
    );
    reqwest::blocking::get(&url)
        .unwrap_or_else(|err| panic!("failed to fetch {url}: {err}"))
        .copy_to(&mut file)
        .unwrap_or_else(|err| panic!("failed to write {}: {}", tmp.display(), err));

    fs::rename(&tmp, dst).unwrap_or_else(|err| {
        panic!(
            "failed to rename {} to {}: {}",
            tmp.display(),
            dst.display(),
            err
        )
    });
}

fn verify_integrity(checksum_path: &Path, files_dir: &Path) {
    let checksum_file = fs::File::open(checksum_path)
        .unwrap_or_else(|err| panic!("failed to open {}: {}", checksum_path.display(), err));
    let checksum_file_reader = BufReader::new(checksum_file);

    for line in checksum_file_reader.lines() {
        let line = line
            .unwrap_or_else(|err| panic!("failed to read {}: {}", checksum_path.display(), err));

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() != 2 {
            panic!("{}: invalid syntax", checksum_path.display());
        }

        let expected_hash = hex::decode(parts[0])
            .unwrap_or_else(|_| panic!("{}: invalid syntax", checksum_path.display()));

        let file_name = parts[1];
        let path = files_dir.join(file_name);
        let mut file = match fs::File::open(&path) {
            Ok(file) => file,
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                println!(
                    "cargo:warning=could not find `{file_name}`. \
                         Consider enabling the `download-params` feature \
                         so that this file can be downloaded and verified \
                         automatically"
                );
                continue;
            }
            Err(err) => panic!("failed to open {}: {}", path.display(), err),
        };

        let mut hasher = Sha512::new();
        io::copy(&mut file, &mut hasher)
            .unwrap_or_else(|err| panic!("failed to read {}: {}", path.display(), err));
        let actual_hash = hasher.finalize();

        if expected_hash != actual_hash.as_slice() {
            panic!("integrity verification failed for {}", path.display());
        }
    }
}

/// Copies the sapling param files into `$OUT_DIR/sapling_params`.
///
/// The files are copied from `src/sapling_params`, if they exist in that directory. Else, it will
/// fetch them from GitHub via HTTPS. In either case, all files are checked for integrity using
/// their SHA-512 checksum.
fn prepare_sapling_params() {
    let out_dir = PathBuf::from(env::var("OUT_DIR").unwrap());
    let params_src_path = Path::new("src/sapling_params");
    let params_dst_path = out_dir.join("sapling_params");

    println!("cargo:rerun-if-changed={}", params_src_path.display());

    fs::create_dir_all(&params_dst_path)
        .unwrap_or_else(|err| panic!("failed to create {}: {}", params_dst_path.display(), err));

    // Copy or fetch all param files
    let param_files = [
        "sapling-mint.params",
        "sapling-output.params",
        "sapling-spend.params",
    ];
    for name in param_files.iter() {
        let src = params_src_path.join(name);
        let dst = params_dst_path.join(name);
        copy_if_present(&src, &dst);
        fetch_if_missing(&dst);
    }

    // Check the integrity of the param files. The checksum file is never downloaded and is assumed
    // to be always present
    let checksum = params_src_path.join("params-sha512.txt");
    verify_integrity(&checksum, &params_dst_path);
}

fn main() {
    prepare_sapling_params();
}
