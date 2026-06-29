"""输入不可信边界：路径校验 + config 字段白名单 + 媒体资源预检。

威胁模型：上传媒体与所有参数一律不可信。omniwm 把路径/部分参数喂给 ffmpeg，
本模块是「浏览器可控字符串」与「ffmpeg 调用」之间的唯一闸口。

审计结论（见计划 C1）：omniwm 全程 subprocess list 参数、无 shell=True、无
drawtext/movie 等可读任意文件的滤镜；唯一 filtergraph 注入面是视频的
resolution / scale_* 字段——故此处对它们做严格白名单。
"""

import re
from pathlib import Path

from .config import (
    max_image_pixels,
    max_video_pixels,
    max_video_seconds,
    media_dir,
)
from .errors import InputRejected

_FFMPEG_PROTOCOLS = re.compile(r"^[a-zA-Z][a-zA-Z0-9+.\-]*://")


def safe_path(raw: str, *, must_exist: bool, must_be_file: bool) -> Path:
    """把不可信路径字符串收敛成 MEDIA_DIR 内的安全真实路径。

    拒绝：空、`-` 开头（ffmpeg 选项注入）、协议串（http:// 等 SSRF/越权读）、
    realpath 后落在 MEDIA_DIR 之外（穿越 / symlink 逃逸）、非常规文件。
    """
    if not raw or not isinstance(raw, str):
        raise InputRejected("路径为空")
    if raw.startswith("-"):
        raise InputRejected("路径不得以 '-' 开头（防 ffmpeg 选项注入）")
    if _FFMPEG_PROTOCOLS.match(raw):
        raise InputRejected("路径不得为协议串（防 SSRF / 越权读）")

    root = media_dir()
    # realpath 规范化：解析 .. 与 symlink 后再判断包含，挡住 symlink 逃逸。
    resolved = Path(raw).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise InputRejected("路径越出 MEDIA_DIR 边界")

    if must_exist and not resolved.exists():
        raise InputRejected(f"路径不存在: {resolved.name}")
    if must_be_file:
        # symlink 本身已被 resolve 跟随；这里要求最终目标是常规文件（非 fifo/设备/目录）。
        if resolved.exists() and not resolved.is_file():
            raise InputRejected("路径不是常规文件")
        if resolved.is_symlink():  # resolve 后理论不会，双保险
            raise InputRejected("路径不得为符号链接")
    return resolved


def safe_dir(raw: str, *, create: bool) -> Path:
    """目录版 safe_path（用于 image 端点的 in/out 文件夹）。"""
    if not raw or raw.startswith("-") or _FFMPEG_PROTOCOLS.match(raw):
        raise InputRejected("非法目录路径")
    root = media_dir()
    resolved = Path(raw).resolve()
    try:
        resolved.relative_to(root)
    except ValueError:
        raise InputRejected("目录越出 MEDIA_DIR 边界")
    if create:
        resolved.mkdir(parents=True, exist_ok=True)
    elif not resolved.is_dir():
        raise InputRejected("目录不存在")
    return resolved


# ─── config 字段白名单（杜绝自由文本进入 filtergraph）───

_WM_MODES = {"corner-cycle", "fixed", "diagonal"}
_FIXED_POS = {"top-left", "top-right", "bottom-left", "bottom-right"}
_IMG_POSITIONS = {
    "bottom-right", "bottom-left", "top-right", "top-left",
    "center-left", "center-right",
}
_BITRATE_RE = re.compile(r"^\d{1,5}[kKmM]?$")


def check_wm_mode(v: str) -> str:
    if v not in _WM_MODES:
        raise InputRejected(f"未知 wm_mode: {v}")
    return v


def check_fixed_pos(v: str) -> str:
    if v not in _FIXED_POS:
        raise InputRejected(f"未知 fixed_pos: {v}")
    return v


def check_img_position(v: str) -> str:
    if v not in _IMG_POSITIONS:
        raise InputRejected(f"未知 position: {v}")
    return v


def check_resolution(v: str) -> str:
    """resolution 直接进 filtergraph，必须严格白名单：'original' 或纯数字。"""
    if v == "original":
        return v
    if not re.fullmatch(r"\d{2,4}", str(v)):
        raise InputRejected("resolution 只接受 'original' 或 2-4 位数字")
    return str(v)


def check_scale(v: int, name: str) -> int:
    """scale_* 进 filtergraph 表达式，必须是合理范围整数。"""
    if not isinstance(v, int) or not (1 <= v <= 200):
        raise InputRejected(f"{name} 须为 1-200 的整数")
    return v


def check_bitrate(v: str) -> str:
    if not _BITRATE_RE.fullmatch(str(v)):
        raise InputRejected("bitrate 格式非法（如 2M / 800k）")
    return str(v)


def check_fps(v: int) -> int:
    if not isinstance(v, int) or not (1 <= v <= 120):
        raise InputRejected("fps 须为 1-120 的整数")
    return v


# ─── 不可信媒体资源预检（解码炸弹 / 超大资源）───

def guard_image(path: Path) -> None:
    """Pillow 解压炸弹防护：拒绝像素总量超限的图片。"""
    from PIL import Image

    Image.MAX_IMAGE_PIXELS = max_image_pixels()
    try:
        with Image.open(path) as im:
            w, h = im.size
    except Image.DecompressionBombError as e:
        raise InputRejected("图片像素超限（疑似解压炸弹）") from e
    except Exception as e:
        raise InputRejected(f"无法解析图片: {path.name}") from e
    if w * h > max_image_pixels():
        raise InputRejected(f"图片分辨率超限: {w}x{h}")


def guard_video(path: Path) -> None:
    """用 ffprobe 预检视频时长/分辨率，超限即拒（timeout ≠ 资源边界）。"""
    import subprocess

    def _probe(entries: str, use_stream: bool) -> str:
        cmd = ["ffprobe", "-v", "error"]
        if use_stream:
            cmd += ["-select_streams", "v:0"]
        cmd += ["-show_entries", entries, "-of", "csv=p=0", str(path)]
        return subprocess.run(cmd, capture_output=True, text=True, timeout=15).stdout.strip()

    try:
        dur_raw = _probe("format=duration", use_stream=False)
        w_raw = _probe("stream=width", use_stream=True)
        h_raw = _probe("stream=height", use_stream=True)
    except FileNotFoundError as e:
        # ffmpeg 缺失交由调用链抛 FFmpegNotFoundError，这里不拦
        raise e
    except Exception as e:
        raise InputRejected(f"无法探测视频: {path.name}") from e

    try:
        dur = float(dur_raw.splitlines()[0]) if dur_raw else 0.0
        w = int(w_raw.splitlines()[0]) if w_raw else 0
        h = int(h_raw.splitlines()[0]) if h_raw else 0
    except (ValueError, IndexError) as e:
        raise InputRejected("视频元数据非法") from e

    if dur > max_video_seconds():
        raise InputRejected(f"视频时长超限: {int(dur)}s > {max_video_seconds()}s")
    if w * h > max_video_pixels():
        raise InputRejected(f"视频分辨率超限: {w}x{h}")
