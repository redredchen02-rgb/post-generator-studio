"""测试夹具：把 MEDIA_DIR 指向临时目录，隔离真实文件系统。"""

import os

import pytest


@pytest.fixture(autouse=True)
def _isolated_media(tmp_path, monkeypatch):
    media = tmp_path / "media"
    media.mkdir()
    monkeypatch.setenv("OMNIWM_MEDIA_DIR", str(media))
    # 清掉 config 的 lru_cache，让每个测试拿到自己的 media_dir
    from app import config

    config.media_dir.cache_clear()
    yield media
    config.media_dir.cache_clear()
