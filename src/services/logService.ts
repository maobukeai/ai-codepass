import { invoke } from '@tauri-apps/api/core';

export interface ManagedLogFile {
  log_file_path: string;
  log_file_name: string;
  file_size: number;
  modified_at_ms: number | null;
}

export interface LogSnapshot {
  log_dir_path: string;
  log_file_path: string;
  log_file_name: string;
  content: string;
  line_limit: number;
  file_size: number;
  modified_at_ms: number | null;
  available_files: ManagedLogFile[];
}

const DEFAULT_LOG_SNAPSHOT: LogSnapshot = {
  log_dir_path: '',
  log_file_path: '',
  log_file_name: '',
  content: '',
  line_limit: 200,
  file_size: 0,
  modified_at_ms: null,
  available_files: [],
};

export async function getLogSnapshot(
  fileName?: string,
  lineLimit?: number,
): Promise<LogSnapshot> {
  try {
    const res = await invoke<LogSnapshot>('logs_get_snapshot', { fileName: fileName ?? null, lineLimit });
    return res || DEFAULT_LOG_SNAPSHOT;
  } catch {
    return DEFAULT_LOG_SNAPSHOT;
  }
}

export async function openLogDirectory(): Promise<void> {
  try {
    await invoke('logs_open_log_directory');
  } catch {}
}
