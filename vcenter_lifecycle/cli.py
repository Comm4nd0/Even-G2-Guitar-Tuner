"""CLI for managing vCenter Lifecycle Manager download settings.

Usage examples:

  # Show current download settings
  python -m vcenter_lifecycle.cli show

  # Apply settings from a YAML config file
  python -m vcenter_lifecycle.cli apply --config config.yaml

  # Enable automatic downloads with defaults
  python -m vcenter_lifecycle.cli enable-auto

  # Disable automatic downloads
  python -m vcenter_lifecycle.cli disable-auto

  # Set the download check schedule
  python -m vcenter_lifecycle.cli set-schedule --day MONDAY --hour 3 --minute 30

  # Configure a proxy
  python -m vcenter_lifecycle.cli set-proxy --server proxy.corp.com --port 8080

  # Remove the proxy
  python -m vcenter_lifecycle.cli clear-proxy

  # Switch download source to UMDS
  python -m vcenter_lifecycle.cli set-source --type UMDS --umds-url https://umds.local/depot
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

import yaml

from vcenter_lifecycle.client import VCenterClient
from vcenter_lifecycle.downloads import (
    DownloadSchedule,
    DownloadSettings,
    DownloadSource,
    ProxySettings,
    clear_proxy,
    configure_download_settings,
    disable_auto_download,
    enable_auto_download,
    get_download_settings,
    set_download_schedule,
    set_download_source,
    set_proxy,
)


def _build_client(args: argparse.Namespace) -> VCenterClient:
    """Create a VCenterClient from CLI args or environment variables."""
    host = args.host or os.environ.get("VCENTER_HOST", "")
    user = args.username or os.environ.get("VCENTER_USERNAME", "")
    password = args.password or os.environ.get("VCENTER_PASSWORD", "")
    verify = args.verify_ssl

    if not host or not user or not password:
        sys.exit(
            "Error: vCenter credentials required. Provide --host, --username, "
            "--password or set VCENTER_HOST, VCENTER_USERNAME, VCENTER_PASSWORD "
            "environment variables."
        )

    return VCenterClient(host, user, password, verify_ssl=verify)


def _print_json(data: dict) -> None:
    print(json.dumps(data, indent=2, default=str))


# --- Sub-commands ---

def cmd_show(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        _print_json(get_download_settings(client))


def cmd_apply(args: argparse.Namespace) -> None:
    config_path = Path(args.config)
    if not config_path.exists():
        sys.exit(f"Error: config file not found: {config_path}")

    cfg = yaml.safe_load(config_path.read_text())

    vc = cfg.get("vcenter", {})
    client = VCenterClient(
        host=vc.get("host", ""),
        username=vc.get("username", ""),
        password=vc.get("password", ""),
        verify_ssl=vc.get("verify_ssl", False),
    )

    dl = cfg.get("downloads", {})
    sched_cfg = dl.get("schedule", {})
    src_cfg = dl.get("source", {})
    proxy_cfg = dl.get("proxy", {})

    settings = DownloadSettings(
        auto_check_enabled=dl.get("auto_check_enabled", True),
        auto_download_enabled=dl.get("auto_download_enabled", True),
        schedule=DownloadSchedule(
            enabled=sched_cfg.get("enabled", True),
            day=sched_cfg.get("day", "EVERYDAY"),
            hour=sched_cfg.get("hour", 2),
            minute=sched_cfg.get("minute", 0),
        ),
        source=DownloadSource(
            source_type=src_cfg.get("type", "INTERNET"),
            umds_url=src_cfg.get("umds_url", ""),
        ),
        proxy=ProxySettings(
            enabled=proxy_cfg.get("enabled", False),
            server=proxy_cfg.get("server", ""),
            port=proxy_cfg.get("port", 80),
            username=proxy_cfg.get("username", ""),
            password=proxy_cfg.get("password", ""),
        ),
    )

    with client:
        result = configure_download_settings(client, settings)
    print("Download settings applied successfully.")
    _print_json(result)


def cmd_enable_auto(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = enable_auto_download(client)
    print("Automatic downloads enabled.")
    _print_json(result)


def cmd_disable_auto(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = disable_auto_download(client)
    print("Automatic downloads disabled.")
    _print_json(result)


def cmd_set_schedule(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = set_download_schedule(
            client, day=args.day, hour=args.hour, minute=args.minute,
        )
    print("Download schedule updated.")
    _print_json(result)


def cmd_set_proxy(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = set_proxy(
            client,
            server=args.server,
            port=args.port,
            username=args.proxy_user or "",
            password=args.proxy_password or "",
        )
    print("Proxy configured.")
    _print_json(result)


def cmd_clear_proxy(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = clear_proxy(client)
    print("Proxy removed.")
    _print_json(result)


def cmd_set_source(args: argparse.Namespace) -> None:
    with _build_client(args) as client:
        result = set_download_source(
            client,
            source_type=args.type,
            umds_url=args.umds_url or "",
        )
    print(f"Download source set to {args.type}.")
    _print_json(result)


# --- Argument parser ---

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Configure vCenter Lifecycle Manager download settings",
    )

    # Global connection args
    parser.add_argument("--host", help="vCenter hostname or IP")
    parser.add_argument("--username", help="vCenter SSO username")
    parser.add_argument("--password", help="vCenter password")
    parser.add_argument(
        "--verify-ssl", action="store_true", default=False,
        help="Verify SSL certificates (default: False)",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    # show
    sub.add_parser("show", help="Show current download settings")

    # apply
    p_apply = sub.add_parser("apply", help="Apply settings from a YAML config file")
    p_apply.add_argument("--config", required=True, help="Path to YAML config file")

    # enable-auto
    sub.add_parser("enable-auto", help="Enable automatic patch downloads")

    # disable-auto
    sub.add_parser("disable-auto", help="Disable automatic patch downloads")

    # set-schedule
    p_sched = sub.add_parser("set-schedule", help="Set the download check schedule")
    p_sched.add_argument("--day", default="EVERYDAY", help="Day of week or EVERYDAY")
    p_sched.add_argument("--hour", type=int, default=2, help="Hour (0-23)")
    p_sched.add_argument("--minute", type=int, default=0, help="Minute (0-59)")

    # set-proxy
    p_proxy = sub.add_parser("set-proxy", help="Configure a download proxy")
    p_proxy.add_argument("--server", required=True, help="Proxy server hostname")
    p_proxy.add_argument("--port", type=int, default=8080, help="Proxy port")
    p_proxy.add_argument("--proxy-user", help="Proxy username")
    p_proxy.add_argument("--proxy-password", help="Proxy password")

    # clear-proxy
    sub.add_parser("clear-proxy", help="Remove the download proxy")

    # set-source
    p_src = sub.add_parser("set-source", help="Set download source (INTERNET or UMDS)")
    p_src.add_argument("--type", required=True, choices=["INTERNET", "UMDS"])
    p_src.add_argument("--umds-url", help="UMDS depot URL (required for UMDS)")

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    handlers = {
        "show": cmd_show,
        "apply": cmd_apply,
        "enable-auto": cmd_enable_auto,
        "disable-auto": cmd_disable_auto,
        "set-schedule": cmd_set_schedule,
        "set-proxy": cmd_set_proxy,
        "clear-proxy": cmd_clear_proxy,
        "set-source": cmd_set_source,
    }

    handlers[args.command](args)


if __name__ == "__main__":
    main()
