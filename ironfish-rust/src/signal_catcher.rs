/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

extern "C" {
    // This is present in libc on unix, but not on linux
    fn backtrace_symbols_fd(buffer: *const *mut libc::c_void, size: libc::c_int, fd: libc::c_int);
}

/// # Safety
/// This is unsafe, it calls libc functions
#[cfg(any(all(unix, target_env = "musl"), target_os = "android"))]
unsafe fn display_trace() {
    libc::exit(libc::EXIT_FAILURE);
}

/// # Safety
/// This is unsafe, it calls libc functions
#[cfg(all(unix, not(target_env = "musl")))]
unsafe fn display_trace() {
    const MAX_FRAMES: usize = 256;
    static mut STACK_TRACE: [*mut libc::c_void; MAX_FRAMES] = [std::ptr::null_mut(); MAX_FRAMES];
    let depth = libc::backtrace(STACK_TRACE.as_mut_ptr(), MAX_FRAMES as i32);
    backtrace_symbols_fd(STACK_TRACE.as_ptr(), depth, 2);
    libc::exit(libc::EXIT_FAILURE);
}

/// # Safety
/// This is unsafe, it calls libc functions
#[cfg(unix)]
pub unsafe fn init_signal_handler() {
    libc::signal(libc::SIGSEGV, display_trace as usize);
    // Rust in release mode will throw one of these in place of a SIGSEGV, not
    // sure why it differs based on system
    libc::signal(libc::SIGTRAP, display_trace as usize);
    libc::signal(libc::SIGILL, display_trace as usize);

    libc::signal(libc::SIGQUIT, display_trace as usize);
    libc::signal(libc::SIGABRT, display_trace as usize);
    libc::signal(libc::SIGEMT, display_trace as usize);
    libc::signal(libc::SIGFPE, display_trace as usize);
    libc::signal(libc::SIGPIPE, display_trace as usize);
    libc::signal(libc::SIGALRM, display_trace as usize);
    libc::signal(libc::SIGTERM, display_trace as usize);
}

/// # Safety
/// This is unsafe, it calls libc functions
#[cfg(not(unix))]
pub unsafe fn init_signal_handler() {
    return;
}

/// # Safety
/// This is unsafe, it intentionally crashes
pub unsafe fn trigger_segfault() {
    std::ptr::null_mut::<i32>().write(42);
}
