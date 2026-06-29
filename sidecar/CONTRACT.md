# omniwm 边车 HTTP wire 契约（冻结）

权威定义。Python 侧 `app/schemas.py`（pydantic）与 Node 侧 zod 都须对齐此文件。
所有路径为 `MEDIA_DIR` 内的路径字符串，由 Node 服务端生成，边车再经 `security.py` 校验。

鉴权：除 `/health` 外，若边车配置了 `OMNIWM_SIDECAR_SECRET`，请求须带 `x-omniwm-secret` 头。

## GET /health
→ `200` `{ ok, ffmpeg, ffprobe, face, media_dir_writable, version }`（全 bool + version: string）

## POST /watermark/image
```jsonc
{ "in_dir": "...", "out_dir": "...", "watermark_path": "...",
  "wm_width": 264, "img_width": 800, "margin": 10, "opacity": 100,
  "position": "bottom-right" }   // position ∈ bottom-right|bottom-left|top-right|top-left|center-left|center-right
```
→ `200` `{ "outputs": ["..."], "count": 0, "moved": 0 }`

## POST /watermark/video
```jsonc
{ "in_path": "...", "out_path": "...", "watermark_path": "...",
  "wm_mode": "corner-cycle",      // corner-cycle|fixed|diagonal
  "fixed_pos": "bottom-right",    // top-left|top-right|bottom-left|bottom-right
  "wmfile2": "",                  // diagonal 模式必填
  "scale_landscape": 35, "scale_portrait": 35,  // 1-200
  "resolution": "720",            // "original" 或 2-4 位数字
  "bitrate": "2M",                // \d{1,5}[kKmM]?
  "fps": 30 }                     // 1-120
```
→ `200` `{ "out_path": "..." }`

## POST /detect
```jsonc
{ "in_path": "..." }
```
→ `200` `{ "regions": {"tl": "x,y,w,h"|null, "tr": ..., "bl": ..., "br": ...},
           "width": 0, "height": 0 }`   // width/height = 源显示分辨率

## POST /delogo
```jsonc
{ "in_path": "...", "out_path": "...",
  "regions": {"tl": "x,y,w,h"|null, ...} }   // 与 /detect 输出同构；须同分辨率源
```
→ `200` `{ "out_path": "..." }`

## 错误（统一 body `{ code, message }`）
| HTTP | code | 触发 |
|---|---|---|
| 400 | `INPUT_REJECTED` | 路径越界/`-`开头/协议串/字段非白名单/资源超限 |
| 401 | `UNAUTHORIZED` | secret 头缺失或错误 |
| 422 | `WATERMARK_ERROR` | omniwm 水印/去标处理失败（坐标越界、模式未知等） |
| 422 | `MEDIA_UNREADABLE` | detect 无法打开视频 |
| 503 | `FFMPEG_NOT_FOUND` | ffmpeg/ffprobe 不在 PATH |
| 500 | `OMNIWM_ERROR` | 其他 omniwm 错误 |
