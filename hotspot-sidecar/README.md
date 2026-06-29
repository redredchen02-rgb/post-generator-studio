# hotspot-sdk sidecar

A **separate Python FastAPI process** that exposes three capabilities from the
vendored `hotspot_sdk` SDK to the Node app over loopback HTTP:

| Endpoint | Capability | Deps |
|---|---|---|
| `POST /score` | Copywriting / hotness scoring (vocabulary-driven, pure) | core (always) |
| `POST /hotspot/snapshot` | Hotspot ranking + jump/drop/new-entry alerts (stateful) | core (always) |
| `POST /content/analyze` | NSFW / cover analysis of a media file | `[content]` (nudenet/opencv) |
| `GET /health` | Liveness + `capabilities` map | core |

Telegram monitoring/forwarding is intentionally **not** wired up.

## Run

```bash
pnpm sidecar:hotspot:setup   # one-time: venv + install vendored wheel (heavy)
pnpm sidecar:hotspot         # reclaim :8770, run on 127.0.0.1
```

Neither `pnpm dev` nor `pnpm start` auto-start this — run it in a separate
terminal. The in-app health banner surfaces when it's down.

## Deployment contract

Same shape as the omniwm sidecar (`../sidecar/CONTRACT.md`):

- The sidecar and Next **must run on the same machine**, as the **same uid**, and
  share the **same `HOTSPOT_MEDIA_ROOT` absolute path** (point it at the same dir
  as `OMNIWM_MEDIA_DIR`). `/content/analyze` only reads files under that root.
- Binds `127.0.0.1:8770` by default. `run.py` **refuses to start** on a
  non-loopback host unless `HOTSPOT_API_KEY` is set — a non-loopback bind exposes
  the file-read endpoint, so it must be authenticated.

## Security env

| Var | Default | Purpose |
|---|---|---|
| `HOTSPOT_HOST` | `127.0.0.1` | Bind host (non-loopback requires `HOTSPOT_API_KEY`) |
| `HOTSPOT_PORT` | `8770` | Listen port |
| `HOTSPOT_API_KEY` | _(unset)_ | If set, every endpoint requires `X-API-Key` (Node sends `HOTSPOT_SIDECAR_SECRET`) |
| `HOTSPOT_MEDIA_ROOT` | _(unset)_ | Required to enable `/content/analyze`; confines + caps file reads |
| `HOTSPOT_MAX_MEDIA_BYTES` | `268435456` | Per-file size cap for `/content/analyze` |

## Tests

```bash
cd hotspot-sidecar && .venv/bin/python -m pytest -q   # if SDK tests are vendored
```
