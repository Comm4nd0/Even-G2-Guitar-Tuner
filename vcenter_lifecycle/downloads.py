"""Configure vCenter Lifecycle Manager download settings.

Covers the settings found in vCenter under:
  Menu > Lifecycle Manager > Settings > Downloads

This includes:
  - Automatic download of patches/updates
  - Download source (Internet or UMDS depot)
  - Proxy configuration for patch downloads
  - Check schedule (frequency of update checks)
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from vcenter_lifecycle.client import VCenterClient

# --- vSphere REST API paths ---
_UPDATE_POLICY_PATH = "/api/appliance/update/policy"
_DEPOT_ONLINE_PATH = "/api/vcenter/lcm/discovery/product-catalog"
_DEPOT_CONTENT_PATH = "/api/content/subscribed-library"


@dataclass
class ProxySettings:
    """HTTP/HTTPS proxy used when downloading patches."""

    enabled: bool = False
    server: str = ""
    port: int = 80
    username: str = ""
    password: str = ""

    def to_dict(self) -> dict[str, Any]:
        result: dict[str, Any] = {"enabled": self.enabled}
        if self.enabled:
            result["server"] = self.server
            result["port"] = self.port
            if self.username:
                result["username"] = self.username
                result["password"] = self.password
        return result


@dataclass
class DownloadSchedule:
    """Schedule controlling how often vCenter checks for new patches."""

    enabled: bool = True
    day: str = "EVERYDAY"  # EVERYDAY, MONDAY..SUNDAY
    hour: int = 2
    minute: int = 0

    _VALID_DAYS = {
        "EVERYDAY", "MONDAY", "TUESDAY", "WEDNESDAY",
        "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY",
    }

    def __post_init__(self) -> None:
        if self.day not in self._VALID_DAYS:
            raise ValueError(
                f"Invalid day '{self.day}'. Must be one of {self._VALID_DAYS}"
            )
        if not (0 <= self.hour <= 23):
            raise ValueError(f"hour must be 0-23, got {self.hour}")
        if not (0 <= self.minute <= 59):
            raise ValueError(f"minute must be 0-59, got {self.minute}")

    def to_dict(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "day": self.day,
            "hour": self.hour,
            "minute": self.minute,
        }


@dataclass
class DownloadSource:
    """Where vCenter downloads patches from.

    source_type:
      "INTERNET" - download directly from VMware online depots (default)
      "UMDS"     - use a local UMDS (Update Manager Download Service) depot
    """

    source_type: str = "INTERNET"
    umds_url: str = ""

    def __post_init__(self) -> None:
        if self.source_type not in ("INTERNET", "UMDS"):
            raise ValueError(
                f"source_type must be 'INTERNET' or 'UMDS', got '{self.source_type}'"
            )


@dataclass
class DownloadSettings:
    """Full set of Lifecycle Manager download settings."""

    auto_check_enabled: bool = True
    auto_download_enabled: bool = True
    schedule: DownloadSchedule = field(default_factory=DownloadSchedule)
    source: DownloadSource = field(default_factory=DownloadSource)
    proxy: ProxySettings = field(default_factory=ProxySettings)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def get_download_settings(client: VCenterClient) -> dict[str, Any]:
    """Retrieve the current Lifecycle Manager download / update policy."""
    resp = client.get(_UPDATE_POLICY_PATH)
    return resp.json()


def configure_download_settings(
    client: VCenterClient,
    settings: DownloadSettings,
) -> dict[str, Any]:
    """Apply download settings to the vCenter Lifecycle Manager.

    Args:
        client: An authenticated VCenterClient.
        settings: The desired download configuration.

    Returns:
        The updated policy as returned by the API.
    """
    policy: dict[str, Any] = {
        "custom_URL": "",
        "auto_stage": settings.auto_download_enabled,
        "check_schedule": [settings.schedule.to_dict()],
        "username": "",
        "password": "",
    }

    if settings.proxy.enabled:
        policy["proxy"] = settings.proxy.to_dict()

    client.put(_UPDATE_POLICY_PATH, json_body=policy)

    # If using UMDS, register the depot URL as a subscribed source
    if settings.source.source_type == "UMDS" and settings.source.umds_url:
        _register_umds_depot(client, settings.source.umds_url)

    return get_download_settings(client)


def enable_auto_download(client: VCenterClient) -> dict[str, Any]:
    """Convenience: turn on automatic patch downloads with defaults."""
    return configure_download_settings(client, DownloadSettings())


def disable_auto_download(client: VCenterClient) -> dict[str, Any]:
    """Convenience: turn off automatic downloads entirely."""
    settings = DownloadSettings(
        auto_check_enabled=False,
        auto_download_enabled=False,
        schedule=DownloadSchedule(enabled=False),
    )
    return configure_download_settings(client, settings)


def set_download_schedule(
    client: VCenterClient,
    *,
    day: str = "EVERYDAY",
    hour: int = 2,
    minute: int = 0,
) -> dict[str, Any]:
    """Convenience: update only the check schedule."""
    current = get_download_settings(client)
    settings = DownloadSettings(
        auto_check_enabled=True,
        auto_download_enabled=current.get("auto_stage", True),
        schedule=DownloadSchedule(enabled=True, day=day, hour=hour, minute=minute),
    )
    return configure_download_settings(client, settings)


def set_proxy(
    client: VCenterClient,
    *,
    server: str,
    port: int = 8080,
    username: str = "",
    password: str = "",
) -> dict[str, Any]:
    """Convenience: configure a download proxy."""
    current = get_download_settings(client)
    settings = DownloadSettings(
        auto_check_enabled=True,
        auto_download_enabled=current.get("auto_stage", True),
        proxy=ProxySettings(
            enabled=True,
            server=server,
            port=port,
            username=username,
            password=password,
        ),
    )
    return configure_download_settings(client, settings)


def clear_proxy(client: VCenterClient) -> dict[str, Any]:
    """Convenience: remove the download proxy."""
    current = get_download_settings(client)
    settings = DownloadSettings(
        auto_check_enabled=True,
        auto_download_enabled=current.get("auto_stage", True),
        proxy=ProxySettings(enabled=False),
    )
    return configure_download_settings(client, settings)


def set_download_source(
    client: VCenterClient,
    *,
    source_type: str = "INTERNET",
    umds_url: str = "",
) -> dict[str, Any]:
    """Convenience: switch between Internet and UMDS download sources."""
    current = get_download_settings(client)
    settings = DownloadSettings(
        auto_check_enabled=True,
        auto_download_enabled=current.get("auto_stage", True),
        source=DownloadSource(source_type=source_type, umds_url=umds_url),
    )
    return configure_download_settings(client, settings)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _register_umds_depot(client: VCenterClient, depot_url: str) -> None:
    """Register a UMDS depot as a subscribed content library source."""
    spec = {
        "create_spec": {
            "name": "UMDS Patch Depot",
            "description": "Local UMDS depot for Lifecycle Manager patches",
            "type": "SUBSCRIBED",
            "subscription_info": {
                "subscription_url": depot_url,
                "authentication_method": "NONE",
                "automatic_sync_enabled": True,
                "on_demand": False,
            },
            "storage_backings": [],
        }
    }
    try:
        client.session.post(
            f"{client.base_url}{_DEPOT_CONTENT_PATH}",
            json=spec,
        ).raise_for_status()
    except Exception:
        # Depot may already exist; not fatal
        pass
