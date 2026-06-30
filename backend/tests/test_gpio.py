"""Tests for GPIO service and API endpoints."""
from __future__ import annotations

import pytest
from app.services import gpio_service


class TestGpioPinMap:
    """Unit tests for the static GPIO pin map."""

    def test_all_40_pins_present(self):
        assert len(gpio_service._PIN_MAP) == 40

    def test_pin_numbers_are_1_to_40(self):
        pins = [entry[0] for entry in gpio_service._PIN_MAP]
        assert sorted(pins) == list(range(1, 41))

    def test_power_and_gnd_pins_are_non_gpio(self):
        non_gpio = [entry for entry in gpio_service._PIN_MAP if entry[1] is None]
        names = [entry[2] for entry in non_gpio]
        assert any("GND" in n for n in names)
        assert any("3.3V" in n or "5V" in n for n in names)

    def test_gpio_pins_are_at_least_17(self):
        gpio_pins = [entry for entry in gpio_service._PIN_MAP if entry[1] is not None]
        assert len(gpio_pins) >= 17


class TestGpioServiceDevMode:
    """Tests for GPIO service behavior when RPi.GPIO is unavailable (dev mode)."""

    def setup_method(self):
        gpio_service._pin_modes.clear()
        gpio_service._pwm_objects.clear()

    def test_get_pins_returns_all_40(self):
        pins = gpio_service.get_pins()
        assert len(pins) == 40

    def test_set_pin_mode_in_dev_mode(self):
        result = gpio_service.set_pin_mode(gpio=17, mode="OUT")
        assert result["gpio"] == 17
        assert result["mode"] == "OUT"
        assert gpio_service._pin_modes[17] == "OUT"

    def test_set_pin_mode_invalid_mode(self):
        with pytest.raises(ValueError, match="Mode must be IN or OUT"):
            gpio_service.set_pin_mode(gpio=17, mode="EXPLODE")

    def test_set_pin_value_dev_mode(self):
        gpio_service.set_pin_mode(gpio=17, mode="OUT")
        result = gpio_service.set_pin_value(gpio=17, value=1)
        assert result["gpio"] == 17
        assert result["value"] == 1

    def test_set_pin_value_invalid_value(self):
        with pytest.raises(ValueError, match="Value must be 0 or 1"):
            gpio_service.set_pin_value(gpio=17, value=5)

    def test_set_pwm_valid(self):
        result = gpio_service.set_pwm(gpio=18, frequency=50.0, duty_cycle=75.0)
        assert result["gpio"] == 18
        assert result["frequency"] == 50.0
        assert result["duty_cycle"] == 75.0
        assert gpio_service._pin_modes[18] == "PWM"

    def test_set_pwm_invalid_frequency(self):
        with pytest.raises(ValueError, match="Frequency"):
            gpio_service.set_pwm(gpio=18, frequency=0, duty_cycle=50.0)

    def test_set_pwm_frequency_too_high(self):
        with pytest.raises(ValueError, match="Frequency"):
            gpio_service.set_pwm(gpio=18, frequency=2_000_000, duty_cycle=50.0)

    def test_set_pwm_invalid_duty_cycle_high(self):
        with pytest.raises(ValueError, match="[Dd]uty"):
            gpio_service.set_pwm(gpio=18, frequency=50.0, duty_cycle=150.0)

    def test_set_pwm_invalid_duty_cycle_negative(self):
        with pytest.raises(ValueError, match="[Dd]uty"):
            gpio_service.set_pwm(gpio=18, frequency=50.0, duty_cycle=-1.0)

    def test_cleanup_clears_state(self):
        gpio_service.set_pin_mode(gpio=17, mode="OUT")
        gpio_service.set_pwm(gpio=18, frequency=100.0, duty_cycle=50.0)
        gpio_service.cleanup()
        assert gpio_service._pin_modes == {}
        assert gpio_service._pwm_objects == {}


class TestGpioApi:
    """API-level tests for GPIO endpoints."""

    @pytest.mark.asyncio
    async def test_gpio_pins_requires_auth(self, client):
        resp = await client.get("/api/v1/gpio/pins")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_gpio_pins_authenticated(self, client, auth_headers):
        resp = await client.get("/api/v1/gpio/pins", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        assert len(data) == 40

    @pytest.mark.asyncio
    async def test_set_pin_mode_requires_auth(self, client):
        resp = await client.post("/api/v1/gpio/pins/17/mode", json={"mode": "OUT"})
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_set_pin_mode_with_auth(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/gpio/pins/17/mode",
            json={"mode": "OUT"},
            headers=auth_headers,
        )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_set_pin_mode_invalid_mode_rejected(self, client, auth_headers):
        resp = await client.post(
            "/api/v1/gpio/pins/17/mode",
            json={"mode": "EXPLODE"},
            headers=auth_headers,
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_set_pin_value_requires_auth(self, client):
        resp = await client.post("/api/v1/gpio/pins/17/set", json={"value": 1})
        assert resp.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_set_pin_value_with_auth(self, client, auth_headers):
        await client.post(
            "/api/v1/gpio/pins/17/mode",
            json={"mode": "OUT"},
            headers=auth_headers,
        )
        resp = await client.post(
            "/api/v1/gpio/pins/17/set",
            json={"value": 0},
            headers=auth_headers,
        )
        assert resp.status_code == 200
