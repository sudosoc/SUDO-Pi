from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from loguru import logger

try:
    import RPi.GPIO as GPIO  # type: ignore
    _gpio_available = True
except (ImportError, RuntimeError):
    GPIO = None  # type: ignore
    _gpio_available = False

# BCM numbering — static pin map for Raspberry Pi 5 40-pin header
# (pin_number, gpio_number, function_name)
_PIN_MAP: list[tuple[int, Optional[int], str]] = [
    (1,  None, "3.3V"),
    (2,  None, "5V"),
    (3,  2,    "SDA1 (I2C)"),
    (4,  None, "5V"),
    (5,  3,    "SCL1 (I2C)"),
    (6,  None, "GND"),
    (7,  4,    "GPIO4 / GPCLK0"),
    (8,  14,   "TXD0 (UART)"),
    (9,  None, "GND"),
    (10, 15,   "RXD0 (UART)"),
    (11, 17,   "GPIO17"),
    (12, 18,   "GPIO18 / PCM_CLK"),
    (13, 27,   "GPIO27"),
    (14, None, "GND"),
    (15, 22,   "GPIO22"),
    (16, 23,   "GPIO23"),
    (17, None, "3.3V"),
    (18, 24,   "GPIO24"),
    (19, 10,   "MOSI (SPI)"),
    (20, None, "GND"),
    (21, 9,    "MISO (SPI)"),
    (22, 25,   "GPIO25"),
    (23, 11,   "SCLK (SPI)"),
    (24, 8,    "CE0 (SPI)"),
    (25, None, "GND"),
    (26, 7,    "CE1 (SPI)"),
    (27, 0,    "ID_SD (EEPROM)"),
    (28, 1,    "ID_SC (EEPROM)"),
    (29, 5,    "GPIO5"),
    (30, None, "GND"),
    (31, 6,    "GPIO6"),
    (32, 12,   "GPIO12 / PWM0"),
    (33, 13,   "GPIO13 / PWM1"),
    (34, None, "GND"),
    (35, 19,   "GPIO19 / MISO1"),
    (36, 16,   "GPIO16"),
    (37, 26,   "GPIO26"),
    (38, 20,   "GPIO20 / MOSI1"),
    (39, None, "GND"),
    (40, 21,   "GPIO21 / SCLK1"),
]

# Runtime state
_pin_modes: dict[int, str] = {}    # gpio → "IN" | "OUT" | "PWM"
_pwm_objects: dict[int, object] = {}  # gpio → RPi.GPIO.PWM instance


def _get_hw_mode(gpio: int) -> str:
    if not _gpio_available:
        return "IN"
    try:
        m = GPIO.gpio_function(gpio)
        return {0: "OUT", 1: "IN", 2: "ALT", 3: "ALT", 4: "ALT", 5: "ALT", 6: "ALT", 7: "ALT"}.get(m, "IN")
    except Exception:
        return "IN"


def get_pins() -> list[dict]:
    if _gpio_available:
        GPIO.setmode(GPIO.BCM)
        GPIO.setwarnings(False)

    result: list[dict] = []
    for (pin, gpio, name) in _PIN_MAP:
        if gpio is None:
            # Power or GND pin
            if "GND" in name:
                mode = "GND"
            else:
                mode = "POWER"
            result.append({"pin": pin, "gpio": pin, "name": name, "mode": mode, "value": None, "pwm_freq": None, "pwm_duty": None})
        else:
            mode = _pin_modes.get(gpio, _get_hw_mode(gpio))
            value = None
            if _gpio_available and mode == "IN":
                try:
                    value = GPIO.input(gpio)
                except Exception:
                    pass
            elif _gpio_available and mode == "OUT":
                try:
                    value = GPIO.input(gpio)
                except Exception:
                    pass
            pwm_info = _pwm_objects.get(gpio)
            result.append({
                "pin": pin,
                "gpio": gpio,
                "name": name,
                "mode": mode,
                "value": value,
                "pwm_freq": None,
                "pwm_duty": None,
            })
    return result


def set_pin_mode(gpio: int, mode: str) -> dict:
    if mode not in ("IN", "OUT"):
        raise ValueError(f"Mode must be IN or OUT, got {mode!r}")
    if not _gpio_available:
        _pin_modes[gpio] = mode
        return {"gpio": gpio, "mode": mode}
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    if mode == "IN":
        GPIO.setup(gpio, GPIO.IN)
    else:
        GPIO.setup(gpio, GPIO.OUT)
    _pin_modes[gpio] = mode
    logger.debug(f"GPIO{gpio} mode set to {mode}")
    return {"gpio": gpio, "mode": mode}


def set_pin_value(gpio: int, value: int) -> dict:
    if value not in (0, 1):
        raise ValueError("Value must be 0 or 1")
    if not _gpio_available:
        return {"gpio": gpio, "value": value}
    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)
    if _pin_modes.get(gpio) != "OUT":
        GPIO.setup(gpio, GPIO.OUT)
        _pin_modes[gpio] = "OUT"
    GPIO.output(gpio, GPIO.HIGH if value else GPIO.LOW)
    logger.debug(f"GPIO{gpio} output set to {value}")
    return {"gpio": gpio, "value": value}


def set_pwm(gpio: int, frequency: float, duty_cycle: float) -> dict:
    if frequency <= 0 or frequency > 1_000_000:
        raise ValueError("Frequency must be between 1 and 1,000,000 Hz")
    if not (0.0 <= duty_cycle <= 100.0):
        raise ValueError("Duty cycle must be between 0 and 100")
    if not _gpio_available:
        _pin_modes[gpio] = "PWM"
        return {"gpio": gpio, "frequency": frequency, "duty_cycle": duty_cycle}

    GPIO.setmode(GPIO.BCM)
    GPIO.setwarnings(False)

    if gpio in _pwm_objects:
        _pwm_objects[gpio].stop()

    GPIO.setup(gpio, GPIO.OUT)
    pwm = GPIO.PWM(gpio, frequency)
    pwm.start(duty_cycle)
    _pwm_objects[gpio] = pwm
    _pin_modes[gpio] = "PWM"
    logger.debug(f"GPIO{gpio} PWM: {frequency}Hz {duty_cycle}%")
    return {"gpio": gpio, "frequency": frequency, "duty_cycle": duty_cycle}


def cleanup() -> None:
    if _gpio_available:
        for pwm in _pwm_objects.values():
            try:
                pwm.stop()
            except Exception:
                pass
        GPIO.cleanup()
    _pwm_objects.clear()
    _pin_modes.clear()
