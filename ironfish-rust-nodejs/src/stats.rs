/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#![cfg(feature = "stats")]

use napi::JsObject;
use napi_derive::module_exports;
use signal_hook::{consts::signal::SIGUSR1, iterator::Signals};
use std::fmt::Write as FmtWrite;
use std::io::{self, Write as IoWrite};
use std::sync::Once;
use std::thread;

fn print_stats(colors: bool) {
    let ecpm_stats = ironfish_jubjub::stats();
    let note_stats = ironfish::merkle_note::stats::get();

    // Write the stats in a buffer first, then write the buffer to stderr. The goal of the buffer
    // is to attempt to write the stats in a single syscall, so that the stats output will not be
    // interleaved with the rest of the output from the main process. This may not always work
    // (depending on the buffering performed by stderr), but it is better than calling `print!`
    // directly.
    let mut s = String::new();

    write!(
        &mut s,
        "\n\
         {highlight}Elliptic Curve Point Multiplication Stats:\n\
         • affine muls: {affine_muls}\n\
         • extended muls: {extended_muls}\n\
         • extended vector muls: {extended_mul_many_calls} calls / {extended_mul_many_operands} points\n\
         Note Encryption Stats:\n\
         • total: {note_construct}\n\
         Note Decryption Stats:\n\
         • for owner: {note_dec_for_owner} ({note_dec_for_owner_ok} [{note_dec_for_owner_ok_percent:.2}%] successful)\n\
         • for spender: {note_dec_for_spender} ({note_dec_for_spender_ok} [{note_dec_for_spender_ok_percent:.2}%] successful){reset}\n\
         \n",
        highlight = if colors { "\x1b[1;31m" } else { "" },
        reset = if colors { "\x1b[0m" } else { "" },
        affine_muls = ecpm_stats.affine_muls,
        extended_muls = ecpm_stats.extended_muls,
        extended_mul_many_calls = ecpm_stats.extended_mul_many_calls,
        extended_mul_many_operands = ecpm_stats.extended_mul_many_operands,
        note_construct = note_stats.construct,
        note_dec_for_owner = note_stats.decrypt_note_for_owner.total,
        note_dec_for_owner_ok = note_stats.decrypt_note_for_owner.successful,
        note_dec_for_owner_ok_percent =
            note_stats.decrypt_note_for_owner.successful as f64 /
            note_stats.decrypt_note_for_owner.total as f64 * 100.,
        note_dec_for_spender = note_stats.decrypt_note_for_spender.total,
        note_dec_for_spender_ok = note_stats.decrypt_note_for_spender.successful,
        note_dec_for_spender_ok_percent =
            note_stats.decrypt_note_for_spender.successful as f64 /
            note_stats.decrypt_note_for_spender.total as f64 * 100.,
    ).expect("failed to write stats to buffer");

    let mut stderr = io::stderr().lock();
    stderr
        .write_all(s.as_bytes())
        .and_then(|()| stderr.flush())
        .expect("failed to write stats to stderr");
}

/// Prints statistics whenever SIGUSR1 is sent to this process.
fn print_stats_on_signal() {
    let mut signals = Signals::new([SIGUSR1]).expect("failed to set up signal handler");
    for _ in signals.forever() {
        print_stats(true);
    }
}

pub fn setup_signal_handler() {
    thread::spawn(print_stats_on_signal);
}

/// Sets up the stats signal handler when the N-API module is imported.
///
/// Technically, the `module_exports` macro is supposed to be used on code that sets up the
/// JavaScript exports. Here we are abusing the functionality a little bit by performing other side
/// actions. However, given that all the code contained in this module is for development only and
/// will never be released to the public, we consider this use acceptable.
#[module_exports]
fn init(_exports: JsObject) -> napi::Result<()> {
    // Due to how Node worker threads work, this N-API module will be imported multiple times (once
    // for the main thread, then once for each worker thread spawned). We use `Once` here to avoid
    // setting up multiple signal handlers, which would result in duplicate stats messages being
    // emitted after receiving a signal.
    static START: Once = Once::new();
    START.call_once(setup_signal_handler);
    Ok(())
}
