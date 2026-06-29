"""四个水印端点：image / video / detect / delogo。

每个端点：先经 security 收敛不可信输入（路径 + 字段白名单 + 资源预检），
再调 omniwm 算法，最后回结构化结果。绝不让浏览器可控字符串裸奔进 ffmpeg。
"""

import os

import omniwm
from fastapi import APIRouter

from . import security as sec
from .schemas import (
    DelogoRequest,
    DelogoResponse,
    DetectRequest,
    DetectResponse,
    ImageWatermarkRequest,
    ImageWatermarkResponse,
    VideoWatermarkRequest,
    VideoWatermarkResponse,
)

router = APIRouter()


@router.post("/watermark/image", response_model=ImageWatermarkResponse)
def watermark_image(req: ImageWatermarkRequest) -> ImageWatermarkResponse:
    in_dir = sec.safe_dir(req.in_dir, create=False)
    out_dir = sec.safe_dir(req.out_dir, create=True)
    wm = sec.safe_path(req.watermark_path, must_exist=True, must_be_file=True)
    position = sec.check_img_position(req.position)
    sec.guard_image(wm)
    for name in os.listdir(in_dir):
        p = in_dir / name
        if p.is_file() and p.suffix.lower() in omniwm.IMAGE_EXTS:
            sec.guard_image(p)

    count, moved = omniwm.watermark_image_folder(
        folder=str(in_dir),
        output=str(out_dir),
        watermark_path=str(wm),
        img_width=req.img_width,
        wm_width=req.wm_width,
        margin=req.margin,
        position=position,
        opacity=req.opacity,
    )
    outputs = [str(out_dir / n) for n in sorted(os.listdir(out_dir))]
    return ImageWatermarkResponse(outputs=outputs, count=count, moved=moved)


@router.post("/watermark/video", response_model=VideoWatermarkResponse)
def watermark_video(req: VideoWatermarkRequest) -> VideoWatermarkResponse:
    in_path = sec.safe_path(req.in_path, must_exist=True, must_be_file=True)
    out_path = sec.safe_path(req.out_path, must_exist=False, must_be_file=False)
    wm = sec.safe_path(req.watermark_path, must_exist=True, must_be_file=True)
    sec.safe_dir(str(out_path.parent), create=True)
    sec.guard_video(in_path)

    cfg = omniwm.VideoWatermarkConfig(
        watermark=str(wm),
        wm_mode=sec.check_wm_mode(req.wm_mode),
        fixed_pos=sec.check_fixed_pos(req.fixed_pos),
        scale_landscape=sec.check_scale(req.scale_landscape, "scale_landscape"),
        scale_portrait=sec.check_scale(req.scale_portrait, "scale_portrait"),
        resolution=sec.check_resolution(req.resolution),
        bitrate=sec.check_bitrate(req.bitrate),
        fps=sec.check_fps(req.fps),
    )
    if cfg.wm_mode == "diagonal":
        wm2 = sec.safe_path(req.wmfile2, must_exist=True, must_be_file=True)
        cfg.wmfile2 = str(wm2)

    omniwm.watermark_video(str(in_path), str(out_path), cfg)
    return VideoWatermarkResponse(out_path=str(out_path))


@router.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest) -> DetectResponse:
    in_path = sec.safe_path(req.in_path, must_exist=True, must_be_file=True)
    sec.guard_video(in_path)
    regions = omniwm.detect_watermark_regions(str(in_path))
    w, h = _video_dims(in_path)
    return DetectResponse(regions=regions, width=w, height=h)


@router.post("/delogo", response_model=DelogoResponse)
def delogo(req: DelogoRequest) -> DelogoResponse:
    in_path = sec.safe_path(req.in_path, must_exist=True, must_be_file=True)
    out_path = sec.safe_path(req.out_path, must_exist=False, must_be_file=False)
    sec.safe_dir(str(out_path.parent), create=True)
    sec.guard_video(in_path)
    omniwm.delogo_video(str(in_path), str(out_path), req.regions)
    return DelogoResponse(out_path=str(out_path))


def _video_dims(path) -> tuple[int, int]:
    """回传源显示分辨率，供 Node/前端校验 detect→delogo 同分辨率契约。"""
    from omniwm.video_utils import get_dimensions

    w, h = get_dimensions(path)
    return int(w or 0), int(h or 0)
