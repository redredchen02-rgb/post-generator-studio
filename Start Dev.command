#!/bin/zsh

# ── 顏色 & 輸出工具 ───────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo "${GREEN}  ✓ $1${NC}" }
warn() { echo "${YELLOW}  ⚠ $1${NC}" }
err()  { echo "${RED}  ✗ $1${NC}"; echo "\n按任意鍵關閉..."; read -k1; exit 1 }
step() { echo "\n${CYAN}${BOLD}▸ $1${NC}" }
info() { echo "  ${CYAN}$1${NC}" }

# ── Ctrl+C 優雅退出 ───────────────────────────────────
trap 'echo "\n\n${YELLOW}已停止 Post Generator Studio${NC}\n"; exit 0' INT TERM

# ── 切換目錄 ──────────────────────────────────────────
PROJECT_DIR="/Users/dex/YDEX/INPORTANT WORK/POST /Post Generator Studio"
cd "$PROJECT_DIR" || err "找不到專案目錄：$PROJECT_DIR"

# ── 防止重複啟動 ──────────────────────────────────────
LOCK_FILE="/tmp/post-generator-studio.lock"
if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE")
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "${YELLOW}⚠ 偵測到已有實例在執行 (PID $OLD_PID)${NC}"
    echo "  [k] 終止舊實例並重新啟動"
    echo "  [o] 直接開啟瀏覽器"
    echo "  [q] 取消"
    read -k1 choice
    echo
    case $choice in
      k) kill "$OLD_PID" 2>/dev/null; sleep 1 ;;
      o) open http://localhost:3000; exit 0 ;;
      *) exit 0 ;;
    esac
  fi
fi
echo $$ > "$LOCK_FILE"
trap 'rm -f "$LOCK_FILE"; echo "\n${YELLOW}已停止 Post Generator Studio${NC}\n"' EXIT

# ── Banner ────────────────────────────────────────────
clear
echo "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     Post Generator Studio  v0.2.0        ║"
echo "  ╚══════════════════════════════════════════╝${NC}"
echo "  $(date '+%Y-%m-%d %H:%M:%S')  •  $PROJECT_DIR\n"

# ── 1. Node.js ────────────────────────────────────────
step "1/6  執行環境"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | sort -V | tail -1)/bin:$PATH"

if ! command -v node &>/dev/null; then
  err "找不到 Node.js，請先安裝：https://nodejs.org"
fi

NODE_VER=$(node -v)
NODE_MAJOR=${NODE_VER#v}; NODE_MAJOR=${NODE_MAJOR%%.*}
if [ "$NODE_MAJOR" -lt 18 ]; then
  err "Node.js 版本過低 ($NODE_VER)，需要 v18 以上"
fi
ok "Node.js $NODE_VER"

# ── 2. pnpm 版本對齊 ──────────────────────────────────
step "2/6  套件管理器"
REQUIRED_PNPM="10.33.0"

if ! command -v pnpm &>/dev/null; then
  warn "找不到 pnpm，正在安裝 $REQUIRED_PNPM..."
  npm install -g "pnpm@$REQUIRED_PNPM" || err "pnpm 安裝失敗"
fi

CURRENT_PNPM=$(pnpm -v 2>/dev/null)
if [ "$CURRENT_PNPM" != "$REQUIRED_PNPM" ]; then
  warn "pnpm 版本不符（目前 $CURRENT_PNPM，需要 $REQUIRED_PNPM），正在更新..."
  npm install -g "pnpm@$REQUIRED_PNPM" 2>&1 | tail -1
fi
ok "pnpm $(pnpm -v)"

# ── 3. 環境設定 ───────────────────────────────────────
step "3/6  環境設定"

if [ ! -f ".env" ]; then
  warn ".env 不存在，從 .env.example 建立..."
  cp .env.example .env
  ok ".env 已建立"
  info "提示：若需加密功能，請填入 POST_GENERATOR_SECRET_KEY"
  info "      執行：echo POST_GENERATOR_SECRET_KEY=\$(openssl rand -hex 32) >> .env"
else
  ok ".env 已存在"
  # 檢查 .env.example 有沒有新增的 key
  NEW_KEYS=$(comm -23 <(grep -o '^[^=]*' .env.example | sort) <(grep -o '^[^=]*' .env | sort) 2>/dev/null)
  if [ -n "$NEW_KEYS" ]; then
    warn ".env.example 有新的設定項尚未加入 .env："
    echo "$NEW_KEYS" | while read k; do info "  缺少：$k"; done
  fi
fi

# 確保 data 目錄存在
DATA_DIR="${POST_GENERATOR_HOME:-$HOME/.post-generator}"
mkdir -p "$DATA_DIR"
ok "資料目錄：$DATA_DIR"

# ── 4. 依賴安裝 ───────────────────────────────────────
step "4/6  套件依賴 (monorepo)"

# 用 pnpm-lock.yaml 判斷是否需要更新
LOCK_HASH_FILE="/tmp/post-generator-lock-hash"
CURRENT_HASH=$(md5 -q pnpm-lock.yaml 2>/dev/null)
LAST_HASH=$(cat "$LOCK_HASH_FILE" 2>/dev/null)

if [ "$CURRENT_HASH" = "$LAST_HASH" ] && [ -d "node_modules" ]; then
  ok "依賴無變更，跳過安裝"
else
  info "偵測到依賴變更，安裝中..."
  pnpm install --frozen-lockfile 2>&1 | grep -E '(packages|warn|error|ERR)' | head -5
  if [ $? -ne 0 ]; then
    warn "frozen-lockfile 失敗，嘗試一般安裝..."
    pnpm install || err "依賴安裝失敗"
  fi
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
  ok "所有 workspace 套件已就緒"
fi

# ── 5. 資料庫 ─────────────────────────────────────────
step "5/6  資料庫"
pnpm db:migrate 2>&1 | grep -v "^$"
if [ $? -eq 0 ]; then
  ok "資料庫已是最新版本"
else
  warn "遷移有警告，繼續啟動"
fi

# ── 6. 啟動伺服器（正式版，單一實例）──────────────────
step "6/6  啟動伺服器"

PORT=3000

# 回收 port：清掉殘留的舊實例，永遠固定用 3000。
# （舊版在 port 被佔用時會退讓到 3001，導致每次啟動都疊加一個新 server —
#   這正是「畫面卡住 / 功能全部不能用」的根因。現在改成回收，不再疊加。）
info "清理殘留的舊實例並回收 port $PORT..."
node scripts/free-port.mjs $PORT 2>/dev/null || { lsof -ti:$PORT 2>/dev/null | xargs kill 2>/dev/null; sleep 1; }

# 檢查 .next cache 是否損壞（build-manifest 必須存在）
if [ -d ".next" ] && [ ! -f ".next/build-manifest.json" ]; then
  warn ".next cache 損壞，清除中..."
  rm -rf .next
  ok ".next cache 已清除"
fi

# 正式建置：CSP 最嚴格、最接近真實行為，且比 dev 模式更穩定、更省資源。
step "建置正式版（首次或程式碼改動後需要約 30–60 秒）"
pnpm build 2>&1 | tail -3 || err "建置失敗"
ok "建置完成"

info "本地網址：http://localhost:$PORT"
info "按 Ctrl+C 停止服務"
echo ""

# 健康偵測 → 成功才開瀏覽器
(
  for i in $(seq 1 30); do
    sleep 2
    if curl -sf "http://localhost:$PORT" &>/dev/null; then
      echo "${GREEN}  ✓ 伺服器已就緒，開啟瀏覽器${NC}"
      open "http://localhost:$PORT"
      break
    fi
  done
) &

pnpm start
