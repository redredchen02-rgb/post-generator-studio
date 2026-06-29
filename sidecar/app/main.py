"""omniwm 边车 FastAPI 应用入口。

强制 loopback 绑定（见 run_dev / 部署文档）；进程间共享 secret 鉴权（若配置）。
"""

import logging
import shutil

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from . import config
from .errors import register_handlers
from .routes import router
from .schemas import HealthResponse

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="omniwm sidecar", version="0.1.0")
register_handlers(app)


@app.middleware("http")
async def _auth(request: Request, call_next):
    """进程间最小鉴权：配置了 secret 就强校验（/health 豁免，供存活探测）。"""
    secret = config.shared_secret()
    if secret and request.url.path != "/health":
        if request.headers.get("x-omniwm-secret") != secret:
            return JSONResponse(status_code=401, content={"code": "UNAUTHORIZED", "message": "bad secret"})
    return await call_next(request)


def _has(bin_name: str) -> bool:
    return shutil.which(bin_name) is not None


def _face_available() -> bool:
    try:
        import ultralytics  # noqa: F401
        return True
    except Exception:
        return False


def _media_writable() -> bool:
    try:
        probe = config.media_dir() / ".health-probe"
        probe.write_text("ok", encoding="utf-8")
        ok = probe.read_text(encoding="utf-8") == "ok"
        probe.unlink(missing_ok=True)
        return ok
    except Exception:
        return False


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    ffmpeg = _has("ffmpeg")
    ffprobe = _has("ffprobe")
    writable = _media_writable()
    return HealthResponse(
        ok=ffmpeg and ffprobe and writable,
        ffmpeg=ffmpeg,
        ffprobe=ffprobe,
        face=_face_available(),
        media_dir_writable=writable,
        version=app.version,
    )


app.include_router(router)
