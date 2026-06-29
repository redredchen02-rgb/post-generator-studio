"""不可信输入边界单测——路径穿越 / 注入面 / 字段白名单。这是 C1/H2 的回归网。"""

import pytest

from app import security as sec
from app.errors import InputRejected


def test_safe_path_rejects_traversal(_isolated_media):
    with pytest.raises(InputRejected):
        sec.safe_path("/etc/passwd", must_exist=False, must_be_file=False)


def test_safe_path_rejects_dash_prefix(_isolated_media):
    with pytest.raises(InputRejected):
        sec.safe_path("-i", must_exist=False, must_be_file=False)


def test_safe_path_rejects_protocol(_isolated_media):
    for url in ("http://evil.com/x", "concat:a|b", "subfile:y"):
        with pytest.raises(InputRejected):
            sec.safe_path(url, must_exist=False, must_be_file=False)


def test_safe_path_rejects_symlink_escape(_isolated_media):
    outside = _isolated_media.parent / "secret.txt"
    outside.write_text("top secret")
    link = _isolated_media / "link.txt"
    link.symlink_to(outside)
    # realpath 解析 symlink 后落在 MEDIA_DIR 外 → 拒
    with pytest.raises(InputRejected):
        sec.safe_path(str(link), must_exist=True, must_be_file=True)


def test_safe_path_accepts_inside_file(_isolated_media):
    f = _isolated_media / "ok.png"
    f.write_bytes(b"x")
    resolved = sec.safe_path(str(f), must_exist=True, must_be_file=True)
    assert resolved == f.resolve()


def test_resolution_whitelist():
    assert sec.check_resolution("720") == "720"
    assert sec.check_resolution("original") == "original"
    for bad in ("720'[main]", "scale=evil", "1e9", ""):
        with pytest.raises(InputRejected):
            sec.check_resolution(bad)


def test_scale_range():
    assert sec.check_scale(35, "s") == 35
    for bad in (0, 201, -1):
        with pytest.raises(InputRejected):
            sec.check_scale(bad, "s")


def test_bitrate_and_fps():
    assert sec.check_bitrate("2M") == "2M"
    with pytest.raises(InputRejected):
        sec.check_bitrate("2M; rm -rf")
    assert sec.check_fps(30) == 30
    with pytest.raises(InputRejected):
        sec.check_fps(999)


def test_mode_and_position_whitelists():
    assert sec.check_wm_mode("fixed") == "fixed"
    with pytest.raises(InputRejected):
        sec.check_wm_mode("evil")
    with pytest.raises(InputRejected):
        sec.check_img_position("nowhere")
