//! Best-effort idle memory trim after the main window is hidden to the tray (#686 vertical slice).
//! Full WebView destroy/recreate is intentionally not done here (state rehydration risk).

/// Trim process working set when possible. Safe no-op on unsupported platforms.
pub fn trim_idle_process_memory() {
    #[cfg(target_os = "windows")]
    {
        windows_trim_working_set();
    }
    #[cfg(target_os = "macos")]
    {
        // No stable public API equivalent to EmptyWorkingSet; leave as no-op.
    }
    #[cfg(target_os = "linux")]
    {
        // Hint only — malloc_trim is glibc-specific and optional.
        // SAFETY: malloc_trim is a best-effort glibc extension.
        #[cfg(target_env = "gnu")]
        unsafe {
            extern "C" {
                fn malloc_trim(pad: usize) -> i32;
            }
            let _ = malloc_trim(0);
        }
    }
}

#[cfg(target_os = "windows")]
fn windows_trim_working_set() {
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::ProcessStatus::EmptyWorkingSet;
    use windows::Win32::System::Threading::{
        GetCurrentProcess, GetCurrentProcessId, OpenProcess, PROCESS_QUERY_INFORMATION,
        PROCESS_SET_QUOTA,
    };

    // SAFETY: EmptyWorkingSet on current process and child processes is a documented best-effort API.
    unsafe {
        let handle = GetCurrentProcess();
        let _ = EmptyWorkingSet(handle);

        let current_pid = GetCurrentProcessId();
        let mut sys = sysinfo::System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
        for (pid, process) in sys.processes() {
            if let Some(parent_pid) = process.parent() {
                if parent_pid.as_u32() == current_pid {
                    if let Ok(child_handle) = OpenProcess(
                        PROCESS_QUERY_INFORMATION | PROCESS_SET_QUOTA,
                        false,
                        pid.as_u32(),
                    ) {
                        let _ = EmptyWorkingSet(child_handle);
                        let _ = CloseHandle(child_handle);
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::trim_idle_process_memory;

    #[test]
    fn trim_idle_process_memory_does_not_panic() {
        trim_idle_process_memory();
    }
}
