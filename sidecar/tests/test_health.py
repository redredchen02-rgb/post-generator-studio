from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health_shape():
    r = client.get("/health")
    assert r.status_code == 200
    body = r.json()
    for key in ("ok", "ffmpeg", "ffprobe", "face", "media_dir_writable", "version"):
        assert key in body
    # ffmpeg 在本机 PATH（CI/dev 前置），media_dir 可写
    assert body["media_dir_writable"] is True


def test_import_omniwm_without_face():
    """降级安全：未装 [face] 也能 import omniwm。"""
    import omniwm

    assert "watermark_image_folder" in omniwm.__all__
