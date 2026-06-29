"""边车异常 → HTTP 状态映射。

InputRejected 是边车自有的「输入不可信被拒」错误（400）；omniwm 自带的
FFmpegNotFoundError/WatermarkError/OmniwmError 由 register_handlers 映射。
"""

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from omniwm import FFmpegNotFoundError, OmniwmError, WatermarkError


class InputRejected(Exception):
    """不可信输入校验失败（路径越界、字段非法、资源超限等）。"""


def _json(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"code": code, "message": message})


def register_handlers(app: FastAPI) -> None:
    @app.exception_handler(InputRejected)
    async def _input(_: Request, exc: InputRejected) -> JSONResponse:
        return _json(400, "INPUT_REJECTED", str(exc))

    @app.exception_handler(FFmpegNotFoundError)
    async def _ffmpeg(_: Request, exc: FFmpegNotFoundError) -> JSONResponse:
        return _json(503, "FFMPEG_NOT_FOUND", str(exc))

    @app.exception_handler(WatermarkError)
    async def _wm(_: Request, exc: WatermarkError) -> JSONResponse:
        return _json(422, "WATERMARK_ERROR", str(exc))

    @app.exception_handler(ValueError)
    async def _value(_: Request, exc: ValueError) -> JSONResponse:
        # detect 对不可读视频抛 ValueError
        return _json(422, "MEDIA_UNREADABLE", str(exc))

    @app.exception_handler(OmniwmError)
    async def _omni(_: Request, exc: OmniwmError) -> JSONResponse:
        return _json(500, "OMNIWM_ERROR", str(exc))
