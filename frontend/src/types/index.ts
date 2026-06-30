export interface User {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  role: "admin" | "operator" | "viewer";
  is_active: boolean;
  created_at: string;
  last_login_at: string | null;
  last_login_ip: string | null;
}

export interface AuthResponse {
  user: User;
  token_type: string;
  expires_in: number;
  csrf_token: string;
}

export interface CpuStats {
  percent: number;
  per_core: number[];
  frequency_mhz: number;
  frequency_max_mhz: number;
  load_avg_1: number;
  load_avg_5: number;
  load_avg_15: number;
  core_count: number;
  thread_count: number;
}

export interface MemoryStats {
  total_bytes: number;
  available_bytes: number;
  used_bytes: number;
  percent: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  swap_percent: number;
}

export interface DiskPartition {
  mountpoint: string;
  device: string;
  fstype: string;
  total_bytes: number;
  used_bytes: number;
  free_bytes: number;
  percent: number;
  read_bytes: number;
  write_bytes: number;
}

export interface TemperatureStats {
  cpu: number | null;
  gpu: number | null;
  sensors: Array<{
    label: string;
    current: number;
    high: number | null;
    critical: number | null;
  }>;
}

export interface NetworkInterfaceStats {
  name: string;
  bytes_sent: number;
  bytes_recv: number;
  packets_sent: number;
  packets_recv: number;
  speed_mbps: number;
  is_up: boolean;
  addresses: string[];
}

export interface ProcessInfo {
  pid: number;
  name: string;
  status: string;
  cpu_percent: number;
  memory_percent: number;
  memory_rss_bytes: number;
  user: string;
  command: string;
  num_threads: number;
  created_time: number;
}

export interface ServiceInfo {
  name: string;
  display_name: string;
  status: string;
  active_state: string;
  load_state: string;
  sub_state: string;
  description: string;
  pid: number | null;
}

export interface SystemStats {
  cpu: CpuStats;
  memory: MemoryStats;
  disks: DiskPartition[];
  temperature: TemperatureStats;
  network_interfaces: NetworkInterfaceStats[];
  uptime_seconds: number;
  boot_time: number;
  hostname: string;
  kernel: string;
  os: string;
  architecture: string;
}

export interface WifiScanResult {
  ssid: string;
  bssid: string;
  signal_dbm: number;
  signal_percent: number;
  frequency_mhz: number;
  channel: number;
  security: string;
  is_connected: boolean;
  is_saved: boolean;
}

export interface WifiProfile {
  id: number;
  ssid: string;
  security: string;
  is_active: boolean;
  priority: number;
  use_dhcp: boolean;
  static_ip: string | null;
  last_connected_at: string | null;
}

export interface WifiStatus {
  is_connected: boolean;
  interface: string;
  ssid: string | null;
  bssid: string | null;
  signal_dbm: number | null;
  signal_percent: number | null;
  ip_address: string | null;
  gateway: string | null;
  dns: string[];
  speed_mbps: number | null;
  rx_bytes: number;
  tx_bytes: number;
  uptime_seconds: number | null;
}

export interface ApClient {
  mac_address: string;
  ip_address: string | null;
  hostname: string | null;
  signal_dbm: number | null;
  connected_since: string | null;
}

export interface ApConfig {
  ssid: string;
  channel: number;
  country_code: string;
  hide_ssid: boolean;
  max_clients: number;
  is_active: boolean;
  band: string;
  ip_address: string;
  subnet: string;
}

export interface ApStatus {
  is_running: boolean;
  interface: string;
  ip_address: string;
  config: ApConfig;
  clients: ApClient[];
  client_count: number;
}

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size_bytes: number;
  modified_at: number;
  permissions: string;
  owner: string;
  group: string;
  is_symlink: boolean;
  symlink_target: string | null;
}

export interface DirectoryListing {
  path: string;
  parent: string | null;
  entries: FileEntry[];
  total: number;
}

export interface AuditLog {
  id: number;
  user_id: number | null;
  username: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  status_code: number | null;
  details: string | null;
  created_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  skip?: number;
  limit?: number;
  page?: number;
  page_size?: number;
}

export type NotificationLevel = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  title: string;
  message: string;
  level: NotificationLevel;
  timestamp: Date;
  read: boolean;
}

export type WebSocketMessageType =
  | "system_metrics"
  | "notification"
  | "ping"
  | "pong"
  | "subscribe"
  | "unsubscribe";

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data?: unknown;
}
