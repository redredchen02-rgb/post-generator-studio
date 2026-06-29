"""真实媒体端到端（需 ffmpeg）：视频加水印 + detect→delogo 同分辨率契约。

mock 测不出 ffmpeg 路径与坐标契约，这里用 ffmpeg 合成视频真跑。
"""

import shutil
import subprocess

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)

pytestmark = pytest.mark.skipif(
    shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None,
    reason="需要 ffmpeg/ffprobe",
)


def _make_clip(path, seconds=2, size="320x240"):
    subprocess.run([
        "ffmpeg", "-y", "-f", "lavfi", "-i", f"testsrc=size={size}:rate=10",
        "-t", str(seconds), "-pix_fmt", "yuv420p", str(path), "-loglevel", "error",
    ], check=True)


def _make_logo(path, size=(48, 24)):
    Image.new("RGBA", size, (255, 0, 0, 255)).save(path)


def test_video_watermark_then_detect_delogo(_isolated_media):
    src = _isolated_media / "src.mp4"
    logo = _isolated_media / "logo.png"
    wm_out = _isolated_media / "wm.mp4"
    _make_clip(src)
    _make_logo(logo)

    # 1) 加固定角水印
    r = client.post("/watermark/video", json={
        "in_path": str(src), "out_path": str(wm_out),
        "watermark_path": str(logo), "wm_mode": "fixed",
        "fixed_pos": "bottom-right", "resolution": "original", "fps": 10,
    })
    assert r.status_code == 200, r.text
    assert wm_out.exists()

    # 2) detect 回坐标 + 源分辨率
    rd = client.post("/detect", json={"in_path": str(wm_out)})
    assert rd.status_code == 200, rd.text
    body = rd.json()
    assert set(body["regions"].keys()) == {"tl", "tr", "bl", "br"}
    assert body["width"] > 0 and body["height"] > 0

    # 3) 用一个明确坐标 delogo（不依赖 detect 是否命中，验证 ffmpeg delogo 路径）
    delogo_out = _isolated_media / "clean.mp4"
    rl = client.post("/delogo", json={
        "in_path": str(wm_out), "out_path": str(delogo_out),
        "regions": {"tl": None, "tr": None, "bl": None,
                    "br": f"{body['width'] - 60},{body['height'] - 40},50,30"},
    })
    assert rl.status_code == 200, rl.text
    assert delogo_out.exists()


def test_delogo_out_of_bounds_rejected(_isolated_media):
    src = _isolated_media / "s.mp4"
    _make_clip(src)
    r = client.post("/delogo", json={
        "in_path": str(src), "out_path": str(_isolated_media / "o.mp4"),
        "regions": {"tl": "0,0,99999,99999", "tr": None, "bl": None, "br": None},
    })
    assert r.status_code == 422
    assert r.json()["code"] == "WATERMARK_ERROR"
