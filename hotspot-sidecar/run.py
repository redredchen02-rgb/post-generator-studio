"""Entry point for the hotspot-sdk FastAPI sidecar.

Thin wrapper over the vendored ``hotspot_sdk`` server: it builds the app via
``create_app`` (config from ``HOTSPOT_*`` env) and runs uvicorn — but adds one
hard safety guard the bare ``hotspot-sdk-server`` does not: it REFUSES TO START
when bound to a non-loopback address without ``HOTSPOT_API_KEY`` set. The
``/content/analyze`` route reads files and ``/telegram/*`` would drive a logged-in
account, so an unauthenticated LAN bind is never acceptable.

Run via ``pnpm sidecar:hotspot`` (which reclaims the port first), not directly.
"""
from __future__ import annotations

import os


def _is_loopback(host: str) -> bool:
    return host in {"127.0.0.1", "localhost", "::1"}


def main() -> None:
    try:
        import uvicorn
    except ImportError as e:  # pragma: no cover
        raise SystemExit(
            "uvicorn not installed. Run `pnpm sidecar:hotspot:setup` first."
        ) from e

    from hotspot_sdk.config import load_config
    from hotspot_sdk.server.app import create_app

    host = os.environ.get("HOTSPOT_HOST", "127.0.0.1")
    port = int(os.environ.get("HOTSPOT_PORT", "8770"))

    # Hard guard: non-loopback bind MUST carry a shared secret.
    if not _is_loopback(host) and not os.environ.get("HOTSPOT_API_KEY"):
        raise SystemExit(
            f"refusing to bind {host} without HOTSPOT_API_KEY — a non-loopback "
            "hotspot sidecar exposes file-read/account endpoints. Set "
            "HOTSPOT_API_KEY (and HOTSPOT_SIDECAR_SECRET on the Node side) or bind 127.0.0.1."
        )

    cfg = load_config(path=os.environ.get("HOTSPOT_CONFIG_FILE") or None)
    app = create_app(cfg)
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    main()
