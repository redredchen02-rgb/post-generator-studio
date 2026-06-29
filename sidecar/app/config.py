"""边车配置：MEDIA_DIR / 端口 / 进程间 secret，全部读环境变量。

与 Node 侧契约：两者必须指向同一个 MEDIA_DIR 绝对路径（共享文件系统路径契约）。
"""

import os
from functools import lru_cache
from pathlib import Path


def _expand(p: str) -> Path:
    return Path(os.path.expanduser(p)).resolve()


@lru_cache(maxsize=1)
def media_dir() -> Path:
    """媒体根目录。与 Node 侧 getMediaDir() 必须一致。"""
    raw = os.environ.get("OMNIWM_MEDIA_DIR") or "~/.post-generator/media"
    d = _expand(raw)
    d.mkdir(parents=True, exist_ok=True)
    return d


def sidecar_port() -> int:
    raw = os.environ.get("OMNIWM_SIDECAR_PORT", "8765")
    try:
        return int(raw)
    except ValueError:
        return 8765


def shared_secret() -> str | None:
    """Node↔边车进程间最小鉴权。未设则不校验（仅本地裸跑/测试）。"""
    s = os.environ.get("OMNIWM_SIDECAR_SECRET")
    return s or None


# 不可信媒体资源上限（timeout ≠ 资源边界）。可经 env 覆盖。
def _int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def max_image_pixels() -> int:
    # Pillow 解压炸弹防护；默认 5000 万像素（约 8660x5773）。
    return _int_env("OMNIWM_MAX_IMAGE_PIXELS", 50_000_000)


def max_video_seconds() -> int:
    return _int_env("OMNIWM_MAX_VIDEO_SECONDS", 1200)  # 20 分钟


def max_video_pixels() -> int:
    # 单帧像素上限；默认约 4K（3840x2160≈830 万）留余量到 1000 万。
    return _int_env("OMNIWM_MAX_VIDEO_PIXELS", 10_000_000)
