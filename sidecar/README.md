# omniwm 边车（FastAPI）

把 vendor 进来的 Python 水印 SDK（`vendor/omniwm-sdk`）包成本地 HTTP 服务，供 Node 主服务调用。
纯算法（图片/视频加水印、delogo 去标、水印检测），运行期依赖系统 `ffmpeg`/`ffprobe`。

## 前置

- Python ≥ 3.10
- `ffmpeg` / `ffprobe` 在 PATH（macOS: `brew install ffmpeg`）

## 安装（一次性，重）

```bash
cd sidecar
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
```

opencv/numpy/fastapi 等 wheel 较大，首装可能数分钟。主仓库经 `pnpm sidecar:setup` 自动化此步。

## 运行

```bash
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8765
```

**强制 loopback**：务必 `--host 127.0.0.1`，**禁止 `0.0.0.0`**（边车是无用户鉴权的「路径读写 + ffmpeg」机器）。

## 环境变量

| 变量 | 默认 | 用途 |
|---|---|---|
| `OMNIWM_MEDIA_DIR` | `~/.post-generator/media` | 媒体根目录，**必须与 Node 侧 `getMediaDir()` 一致** |
| `OMNIWM_SIDECAR_PORT` | `8765` | 监听端口 |
| `OMNIWM_SIDECAR_SECRET` | 无 | 设置后，除 `/health` 外请求须带 `x-omniwm-secret` 头 |
| `OMNIWM_MAX_IMAGE_PIXELS` | `50000000` | 图片像素上限（解压炸弹防护） |
| `OMNIWM_MAX_VIDEO_SECONDS` | `1200` | 视频时长上限 |
| `OMNIWM_MAX_VIDEO_PIXELS` | `10000000` | 视频单帧像素上限 |

## 部署约束（路径契约）

边车与 Node 必须：**同机** + 共享**同一 `MEDIA_DIR` 绝对路径** + **同 uid / 共同读写权限**。
容器化须共享卷且路径字符串完全一致。这是共享文件系统路径契约的硬前提。

## 安全边界

`app/security.py` 是「浏览器可控字符串」与「ffmpeg 调用」之间的唯一闸口：
路径经 realpath 校验落在 `MEDIA_DIR` 内、拒 `-`/symlink/协议串；config 字段全白名单
（唯一进 filtergraph 的 `resolution`/`scale_*` 严格收敛）；媒体经 ffprobe/Pillow 资源预检。
omniwm 审计结论：全程 subprocess list 参数、无 shell、无 drawtext/movie 可读任意文件的滤镜。

## 契约

见 `CONTRACT.md`（冻结的 wire 契约，Node 侧 zod 须对齐）。

## 测试

```bash
.venv/bin/python -m pytest -q          # 全部
.venv/bin/python -m pytest -q -m "not e2e"   # 跳过需 ffmpeg 的 e2e
```
