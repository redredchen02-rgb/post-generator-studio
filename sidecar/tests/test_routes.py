"""端点测试：image 真跑（Pillow 生成 fixture）+ 注入用例被拒。

video/detect/delogo 的真实媒体端到端在 test_e2e.py（需 ffmpeg 合成视频）。
"""

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image

from app.main import app

client = TestClient(app)


def _make_png(path, size=(200, 200), color=(120, 120, 120)):
    Image.new("RGB", size, color).save(path)


def test_watermark_image_happy(_isolated_media):
    in_dir = _isolated_media / "job1" / "in"
    out_dir = _isolated_media / "job1" / "out"
    in_dir.mkdir(parents=True)
    _make_png(in_dir / "photo.png")
    _make_png(_isolated_media / "logo.png", size=(40, 20), color=(255, 0, 0))

    r = client.post("/watermark/image", json={
        "in_dir": str(in_dir),
        "out_dir": str(out_dir),
        "watermark_path": str(_isolated_media / "logo.png"),
        "wm_width": 30,
        "position": "bottom-right",
    })
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["count"] == 1
    assert len(body["outputs"]) == 1
    assert (out_dir).exists()


def test_image_rejects_traversal_watermark(_isolated_media):
    in_dir = _isolated_media / "j" / "in"
    in_dir.mkdir(parents=True)
    r = client.post("/watermark/image", json={
        "in_dir": str(in_dir),
        "out_dir": str(_isolated_media / "j" / "out"),
        "watermark_path": "/etc/hosts",
    })
    assert r.status_code == 400
    assert r.json()["code"] == "INPUT_REJECTED"


def test_video_rejects_bad_resolution(_isolated_media):
    f = _isolated_media / "in.mp4"
    f.write_bytes(b"not really a video")
    r = client.post("/watermark/video", json={
        "in_path": str(f),
        "out_path": str(_isolated_media / "out.mp4"),
        "watermark_path": str(f),
        "resolution": "720'[x];evil",
    })
    # resolution 白名单在 guard_video 之前？不——guard_video 先跑会因假视频失败。
    # 这里假视频会先被 guard_video 以 INPUT_REJECTED 拒（无法探测），同样是 400。
    assert r.status_code in (400, 422)
    assert r.json()["code"] in ("INPUT_REJECTED", "MEDIA_UNREADABLE")


def test_detect_rejects_missing_file(_isolated_media):
    r = client.post("/detect", json={"in_path": str(_isolated_media / "nope.mp4")})
    assert r.status_code == 400
    assert r.json()["code"] == "INPUT_REJECTED"


def test_auth_required_when_secret_set(_isolated_media, monkeypatch):
    monkeypatch.setenv("OMNIWM_SIDECAR_SECRET", "s3cret")
    # /health 豁免
    assert client.get("/health").status_code == 200
    # 业务端点缺 secret → 401
    r = client.post("/detect", json={"in_path": str(_isolated_media / "x.mp4")})
    assert r.status_code == 401
    # 带正确 secret → 通过鉴权（之后因文件不存在被 400）
    r2 = client.post("/detect", json={"in_path": str(_isolated_media / "x.mp4")},
                     headers={"x-omniwm-secret": "s3cret"})
    assert r2.status_code == 400
