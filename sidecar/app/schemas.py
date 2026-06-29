"""边车 HTTP wire 契约（pydantic）。

这是跨语言契约的 Python 侧落地；权威定义见 sidecar/CONTRACT.md，Node 侧 zod 须对齐。
所有路径字段为 MEDIA_DIR 内的路径字符串（由 Node 服务端生成，边车再经 security 校验）。
"""

from pydantic import BaseModel, Field


class ImageWatermarkRequest(BaseModel):
    in_dir: str = Field(..., description="输入目录（每 job 仅含一个源文件）")
    out_dir: str = Field(..., description="输出目录")
    watermark_path: str
    wm_width: int = 264
    img_width: int = 800
    margin: int = 10
    opacity: int = 100
    position: str = "bottom-right"


class ImageWatermarkResponse(BaseModel):
    outputs: list[str]
    count: int
    moved: int


class VideoWatermarkRequest(BaseModel):
    in_path: str
    out_path: str
    watermark_path: str
    wm_mode: str = "corner-cycle"
    fixed_pos: str = "bottom-right"
    wmfile2: str = ""
    scale_landscape: int = 35
    scale_portrait: int = 35
    resolution: str = "720"
    bitrate: str = "2M"
    fps: int = 30


class VideoWatermarkResponse(BaseModel):
    out_path: str


class DetectRequest(BaseModel):
    in_path: str


class DetectResponse(BaseModel):
    regions: dict[str, str | None]
    width: int
    height: int


class DelogoRequest(BaseModel):
    in_path: str
    out_path: str
    regions: dict[str, str | None]


class DelogoResponse(BaseModel):
    out_path: str


class HealthResponse(BaseModel):
    ok: bool
    ffmpeg: bool
    ffprobe: bool
    face: bool
    media_dir_writable: bool
    version: str
