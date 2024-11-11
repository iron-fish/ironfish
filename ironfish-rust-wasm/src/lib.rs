#![warn(clippy::dbg_macro)]
#![warn(clippy::print_stderr)]
#![warn(clippy::print_stdout)]
#![warn(unreachable_pub)]
#![warn(unused_crate_dependencies)]
#![warn(unused_macro_rules)]
#![warn(unused_qualifications)]

// The getrandom dependency exists only to ensure that the `js` feature is enabled
use getrandom as _;

pub mod errors;
pub mod primitives;
