"""Tests for Bluetooth service and API endpoints."""
from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, patch

from app.services import bluetooth_service


class TestBluetoothValidation:
    """Unit tests for MAC address validation."""

    def test_valid_mac_addresses(self):
        valid = [
            "AA:BB:CC:DD:EE:FF",
            "aa:bb:cc:dd:ee:ff",
            "00:1A:2B:3C:4D:5E",
            "11:22:33:44:55:66",
        ]
        for mac in valid:
            assert bluetooth_service._validate_mac(mac) is True, f"Expected {mac!r} to be valid"

    def test_invalid_mac_addresses(self):
        invalid = [
            "not-a-mac",
            "GG:HH:II:JJ:KK:LL",
            "AA:BB:CC:DD:EE",
            "AA:BB:CC:DD:EE:FF:00",
            "AA:BB:CC:DD:EE:FF; rm -rf /",
            "",
            "AA:BB:CC:DD:EE:FG",
        ]
        for mac in invalid:
            assert bluetooth_service._validate_mac(mac) is False, f"Expected {mac!r} to be invalid"


class TestBluetoothServiceFunctions:
    """Unit tests for Bluetooth service async functions."""

    @pytest.mark.asyncio
    async def test_list_paired_devices_parses_output(self):
        bt_output = (
            "Device AA:BB:CC:DD:EE:FF MyPhone\n"
            "Device 11:22:33:44:55:66 Headset\n"
        )
        async def mock_bluetoothctl(*args, **kwargs):
            if "Paired" in args:
                return 0, bt_output
            return 0, ""

        with patch.object(bluetooth_service, "_bluetoothctl", side_effect=mock_bluetoothctl):
            devices = await bluetooth_service.list_paired_devices()

        assert len(devices) == 2
        macs = [d["mac"] for d in devices]
        assert "AA:BB:CC:DD:EE:FF" in macs
        assert "11:22:33:44:55:66" in macs

    @pytest.mark.asyncio
    async def test_list_paired_devices_empty(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "")
            devices = await bluetooth_service.list_paired_devices()
        assert devices == []

    @pytest.mark.asyncio
    async def test_pair_device_invalid_mac_raises(self):
        with pytest.raises(ValueError, match="Invalid MAC"):
            await bluetooth_service.pair_device("not-a-mac")

    @pytest.mark.asyncio
    async def test_pair_device_valid_mac(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "Paired: yes\nConnected: yes")
            result = await bluetooth_service.pair_device("AA:BB:CC:DD:EE:FF")
        assert result["mac"] == "AA:BB:CC:DD:EE:FF"
        assert result["status"] == "paired"

    @pytest.mark.asyncio
    async def test_pair_device_failure_raises(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (1, "Failed to pair\nAttempt failed")
            with pytest.raises(RuntimeError, match="[Pp]airing failed"):
                await bluetooth_service.pair_device("AA:BB:CC:DD:EE:FF")

    @pytest.mark.asyncio
    async def test_disconnect_device_invalid_mac(self):
        with pytest.raises(ValueError, match="Invalid MAC"):
            await bluetooth_service.disconnect_device("bad-mac")

    @pytest.mark.asyncio
    async def test_disconnect_device_valid_mac(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "Successful disconnected")
            result = await bluetooth_service.disconnect_device("AA:BB:CC:DD:EE:FF")
        assert result["mac"] == "AA:BB:CC:DD:EE:FF"
        assert result["status"] == "disconnected"

    @pytest.mark.asyncio
    async def test_remove_device_invalid_mac(self):
        with pytest.raises(ValueError, match="Invalid MAC"):
            await bluetooth_service.remove_device("bad-mac")

    @pytest.mark.asyncio
    async def test_remove_device_valid_mac(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "Device has been removed")
            result = await bluetooth_service.remove_device("AA:BB:CC:DD:EE:FF")
        assert result["mac"] == "AA:BB:CC:DD:EE:FF"
        assert result["status"] == "removed"

    @pytest.mark.asyncio
    async def test_remove_device_failure_raises(self):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (1, "Error: unable to remove")
            with pytest.raises(RuntimeError):
                await bluetooth_service.remove_device("AA:BB:CC:DD:EE:FF")


class TestBluetoothApi:
    """API-level tests for Bluetooth endpoints."""

    @pytest.mark.asyncio
    async def test_list_devices_requires_auth(self, client):
        resp = await client.get("/api/v1/bluetooth/devices")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_devices_authenticated(self, client, auth_headers):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "")
            resp = await client.get("/api/v1/bluetooth/devices", headers=auth_headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_scan_requires_auth(self, client):
        resp = await client.get("/api/v1/bluetooth/scan")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_pair_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/bluetooth/pair",
            json={"mac": "AA:BB:CC:DD:EE:FF"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_pair_with_auth(self, client, auth_headers):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "Paired: yes")
            resp = await client.post(
                "/api/v1/bluetooth/pair",
                json={"mac": "AA:BB:CC:DD:EE:FF"},
                headers=auth_headers,
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_pair_invalid_mac(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/bluetooth/pair",
            json={"mac": "not-a-mac"},
            headers=auth_headers,
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_disconnect_requires_auth(self, client):
        resp = await client.post(
            "/api/v1/bluetooth/disconnect",
            json={"mac": "AA:BB:CC:DD:EE:FF"},
        )
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_disconnect_with_auth(self, client, auth_headers):
        with patch.object(bluetooth_service, "_bluetoothctl", new_callable=AsyncMock) as mock_bt:
            mock_bt.return_value = (0, "Successful disconnected")
            resp = await client.post(
                "/api/v1/bluetooth/disconnect",
                json={"mac": "AA:BB:CC:DD:EE:FF"},
                headers=auth_headers,
            )
        assert resp.status_code == 200
