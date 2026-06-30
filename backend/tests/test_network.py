"""Tests for network service and API endpoints."""
from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, mock_open, patch

import pytest
from app.services import network_service


_ARP_HEADER = "IP address       HW type     Flags       HW address            Mask     Device\n"
_ARP_VALID_ROW = "192.168.4.101    0x1         0x2         aa:bb:cc:dd:ee:ff     *        wlan0\n"
_ARP_OTHER_ROW = "192.168.1.10     0x1         0x2         11:22:33:44:55:66     *        eth0\n"
_ARP_ZERO_ROW  = "10.0.0.1         0x1         0x0         00:00:00:00:00:00     *        wlan1\n"


class TestNetworkServiceArpTable:
    """Unit tests for ARP table parsing."""

    @pytest.mark.asyncio
    async def test_filters_out_zero_mac_entries(self):
        content = _ARP_HEADER + _ARP_VALID_ROW + _ARP_ZERO_ROW
        with patch("builtins.open", mock_open(read_data=content)):
            entries = await network_service.get_arp_table()

        macs = [e["mac_address"] for e in entries]
        assert "aa:bb:cc:dd:ee:ff" in macs
        assert "00:00:00:00:00:00" not in macs

    @pytest.mark.asyncio
    async def test_returns_multiple_valid_entries(self):
        content = _ARP_HEADER + _ARP_VALID_ROW + _ARP_OTHER_ROW
        with patch("builtins.open", mock_open(read_data=content)):
            entries = await network_service.get_arp_table()

        assert len(entries) == 2

    @pytest.mark.asyncio
    async def test_marks_ap_interface_entries_as_ap_client(self):
        from app.core.config import settings
        ap_row = f"192.168.4.101    0x1         0x2         aa:bb:cc:dd:ee:ff     *        {settings.AP_INTERFACE}\n"
        content = _ARP_HEADER + ap_row
        with patch("builtins.open", mock_open(read_data=content)):
            entries = await network_service.get_arp_table()

        assert len(entries) == 1
        assert entries[0]["is_ap_client"] is True

    @pytest.mark.asyncio
    async def test_non_ap_interface_not_marked_as_ap_client(self):
        content = _ARP_HEADER + _ARP_OTHER_ROW
        with patch("builtins.open", mock_open(read_data=content)):
            entries = await network_service.get_arp_table()

        assert len(entries) == 1
        assert entries[0]["is_ap_client"] is False

    @pytest.mark.asyncio
    async def test_os_error_returns_empty_list(self):
        with patch("builtins.open", side_effect=OSError("No such file")):
            entries = await network_service.get_arp_table()

        assert entries == []

    @pytest.mark.asyncio
    async def test_empty_arp_table(self):
        with patch("builtins.open", mock_open(read_data=_ARP_HEADER)):
            entries = await network_service.get_arp_table()

        assert entries == []

    @pytest.mark.asyncio
    async def test_entry_fields_present(self):
        content = _ARP_HEADER + _ARP_VALID_ROW
        with patch("builtins.open", mock_open(read_data=content)):
            entries = await network_service.get_arp_table()

        assert len(entries) == 1
        entry = entries[0]
        assert "ip_address" in entry
        assert "mac_address" in entry
        assert "interface" in entry
        assert "is_ap_client" in entry
        assert entry["ip_address"] == "192.168.4.101"
        assert entry["mac_address"] == "aa:bb:cc:dd:ee:ff"
        assert entry["interface"] == "wlan0"


class TestNetworkApi:
    """API-level tests for network endpoints."""

    @pytest.mark.asyncio
    async def test_arp_requires_auth(self, client):
        resp = await client.get("/api/v1/network/arp")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_arp_authenticated(self, client, auth_headers):
        arp_content = _ARP_HEADER + _ARP_VALID_ROW
        with patch("builtins.open", mock_open(read_data=arp_content)):
            resp = await client.get("/api/v1/network/arp", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["mac_address"] == "aa:bb:cc:dd:ee:ff"

    @pytest.mark.asyncio
    async def test_arp_empty_table(self, client, auth_headers):
        with patch("builtins.open", mock_open(read_data=_ARP_HEADER)):
            resp = await client.get("/api/v1/network/arp", headers=auth_headers)

        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_ap_clients_requires_auth(self, client):
        resp = await client.get("/api/v1/network/ap/clients")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_ap_clients_authenticated(self, client, auth_headers):
        with patch.object(network_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (1, "", "")
            resp = await client.get("/api/v1/network/ap/clients", headers=auth_headers)

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_wifi_status_requires_auth(self, client):
        resp = await client.get("/api/v1/network/wifi/status")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_wifi_status_authenticated(self, client, auth_headers):
        with patch.object(network_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (1, "", "Error: no active connection")
            resp = await client.get("/api/v1/network/wifi/status", headers=auth_headers)

        assert resp.status_code == 200
        data = resp.json()
        assert "connected" in data

    @pytest.mark.asyncio
    async def test_scan_wifi_requires_auth(self, client):
        resp = await client.get("/api/v1/network/wifi/scan")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_scan_wifi_authenticated(self, client, auth_headers):
        scan_output = (
            "IN-USE  BSSID              SSID       MODE   CHAN  RATE  SIGNAL  BARS  SECURITY\n"
            "        AA:BB:CC:DD:EE:FF  HomeNet    Infra  6     130   70      ▂▄▆_  WPA2    \n"
        )
        with patch.object(network_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, scan_output, "")
            resp = await client.get("/api/v1/network/wifi/scan", headers=auth_headers)

        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_wifi_connect_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/network/wifi/connect",
            json={"ssid": "TestNet", "password": "password123"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_wifi_connect_with_auth(self, client, auth_headers):
        with patch.object(network_service, "_run", new_callable=AsyncMock) as mock_run:
            mock_run.return_value = (0, "Device 'wlan1' successfully activated.", "")
            resp = await client.post(
                "/api/v1/network/wifi/connect",
                json={"ssid": "TestNet", "password": "password123"},
                headers=auth_headers,
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_wifi_disconnect_requires_auth(self, client):
        resp = await client.post("/api/v1/network/wifi/disconnect")
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_ap_status_requires_auth(self, client):
        resp = await client.get("/api/v1/network/ap")
        assert resp.status_code == 401
