/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

use napi_derive::napi;

extern "C" {
    #[cfg(all(unix, not(target_env = "musl"), not(target_os = "android")))]
    fn backtrace_symbols_fd(buffer: *const *mut libc::c_void, size: libc::c_int, fd: libc::c_int);
}

fn display_trace(_signal: libc::c_int) {
    #[cfg(all(unix, not(target_env = "musl"), not(target_os = "android")))]
    unsafe {
        const MAX_FRAMES: usize = 256;
        let mut stack_trace = [std::ptr::null_mut(); MAX_FRAMES];
        let depth = libc::backtrace(stack_trace.as_mut_ptr(), MAX_FRAMES as i32);
        backtrace_symbols_fd(stack_trace.as_ptr(), depth, libc::STDERR_FILENO);
    }

    std::process::abort();
}

#[napi(js_name = "initSignalHandler")]
pub fn init_signal_handler() {
    #[cfg(unix)]
    unsafe {
        libc::signal(libc::SIGSEGV, display_trace as usize);
        // Rust may throw one of these in place of a SIGSEGV when the platform does not have a
        // native implementation for `abort()`, or sometimes when encountering internal errors,
        // see: https://doc.rust-lang.org/std/intrinsics/fn.abort.html
        libc::signal(libc::SIGBUS, display_trace as usize);
        libc::signal(libc::SIGILL, display_trace as usize);
        libc::signal(libc::SIGTRAP, display_trace as usize);
    }
}
