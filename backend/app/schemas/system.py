from __future__ import annotations

from pydantic import BaseModel


class CpuStats(BaseModel):
    percent: float
    per_core: list[float]
    frequency_mhz: float
    frequency_max_mhz: float
    load_avg_1: float
    load_avg_5: float
    load_avg_15: float
    core_count: int
    thread_count: int


class MemoryStats(BaseModel):
    total_bytes: int
    available_bytes: int
    used_bytes: int
    percent: float
    swap_total_bytes: int
    swap_used_bytes: int
    swap_percent: float


class DiskPartition(BaseModel):
    mountpoint: str
    device: str
    fstype: str
    total_bytes: int
    used_bytes: int
    free_bytes: int
    percent: float
    read_bytes: int
    write_bytes: int


class TemperatureReading(BaseModel):
    label: str
    current: float
    high: float | None
    critical: float | None


class TemperatureStats(BaseModel):
    cpu: float | None
    gpu: float | None
    sensors: list[TemperatureReading]


class NetworkInterfaceStats(BaseModel):
    name: str
    bytes_sent: int
    bytes_recv: int
    packets_sent: int
    packets_recv: int
    speed_mbps: int
    is_up: bool
    addresses: list[str]


class ProcessInfo(BaseModel):
    pid: int
    name: str
    status: str
    cpu_percent: float
    memory_percent: float
    memory_rss_bytes: int
    user: str
    command: str
    num_threads: int
    created_time: float


class ServiceInfo(BaseModel):
    name: str
    display_name: str
    status: str
    active_state: str
    load_state: str
    sub_state: str
    description: str
    pid: int | None


class SystemStats(BaseModel):
    cpu: CpuStats
    memory: MemoryStats
    disks: list[DiskPartition]
    temperature: TemperatureStats
    network_interfaces: list[NetworkInterfaceStats]
    uptime_seconds: float
    boot_time: float
    hostname: str
    kernel: str
    os: str
    architecture: str


class ServiceActionRequest(BaseModel):
    action: str


class SystemLogEntry(BaseModel):
    timestamp: str
    unit: str
    message: str
    priority: int


class UptimeStats(BaseModel):
    uptime_seconds: float
    boot_time: float
    uptime_human: str
