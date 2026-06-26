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

# ── 自我修復：每次成功啟動都讓自己保持「可雙擊」狀態 ──
# 若這個檔被同步/備份/解壓工具加上 macOS 隔離標記（Gatekeeper 會擋雙擊），或被
# 編輯器還原時掉了可執行位，趁這次還跑得起來先把下一次修好。git 已用 755 追蹤，
# clone/checkout 本來就乾淨；這兩行是 disk 端的額外保險。
chmod +x "$0" 2>/dev/null
xattr -d com.apple.quarantine "$0" 2>/dev/null

# ── 防止重複啟動（自動回收，不再卡在詢問畫面）──────────
# 舊版會在偵測到舊實例時停下來等你按 k/o/q —— 雙擊啟動時這一停就像「打不開」。
# 現在改成：偵測到還活著的舊實例就直接關掉它，本次永遠是乾淨的單一實例。
# （佔住 3000 的舊 server 會在下方 pnpm start:clean 的 free-port 階段一併回收。）
LOCK_FILE="/tmp/post-generator-studio.lock"
if [ -f "$LOCK_FILE" ]; then
  OLD_PID=$(cat "$LOCK_FILE" 2>/dev/null)
  if [ -n "$OLD_PID" ] && [ "$OLD_PID" != "$$" ] && kill -0 "$OLD_PID" 2>/dev/null; then
    warn "偵測到舊實例 (PID $OLD_PID)，自動關閉並重新啟動..."
    kill "$OLD_PID" 2>/dev/null
    sleep 1
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

# ── 1. 套件管理器（pnpm 會自動鎖定 Node 22.22.3）──────
# 所有 node 相關步驟一律經由 pnpm 執行：.npmrc 的 use-node-version 會強制使用
# Node 22.22.3，不管 shell PATH 裡是哪個 Node（這台機器同時有 22 / 24 / 26）。
# 這是 better-sqlite3 ABI 崩潰的根本解。
step "1/4  套件管理器"
REQUIRED_PNPM="10.33.0"
if ! command -v pnpm &>/dev/null; then
  warn "找不到 pnpm，正在安裝 $REQUIRED_PNPM..."
  npm install -g "pnpm@$REQUIRED_PNPM" || err "pnpm 安裝失敗"
fi
ok "pnpm $(pnpm -v)"
NODE_VER=$(pnpm exec node -v 2>/dev/null)
ok "Node $NODE_VER  (pnpm 已鎖定 22.22.3)"

# ── 2. 環境設定 ───────────────────────────────────────
step "2/4  環境設定"
if [ ! -f ".env" ]; then
  warn ".env 不存在，從 .env.example 建立..."
  cp .env.example .env
  ok ".env 已建立"
  info "提示：若需加密功能，請填入 POST_GENERATOR_SECRET_KEY"
  info "      執行：echo POST_GENERATOR_SECRET_KEY=\$(openssl rand -hex 32) >> .env"
else
  ok ".env 已存在"
  NEW_KEYS=$(comm -23 <(grep -o '^[^=]*' .env.example | sort) <(grep -o '^[^=]*' .env | sort) 2>/dev/null)
  if [ -n "$NEW_KEYS" ]; then
    warn ".env.example 有新的設定項尚未加入 .env："
    echo "$NEW_KEYS" | while read k; do info "  缺少：$k"; done
  fi
fi
DATA_DIR="${POST_GENERATOR_HOME:-$HOME/.post-generator}"
mkdir -p "$DATA_DIR"
ok "資料目錄：$DATA_DIR"

# ── 3. 依賴安裝（lockfile 有變才裝）───────────────────
step "3/4  套件依賴"
LOCK_HASH_FILE="/tmp/post-generator-lock-hash"
CURRENT_HASH=$(md5 -q pnpm-lock.yaml 2>/dev/null)
LAST_HASH=$(cat "$LOCK_HASH_FILE" 2>/dev/null)
if [ "$CURRENT_HASH" = "$LAST_HASH" ] && [ -d "node_modules" ]; then
  ok "依賴無變更，跳過安裝"
else
  info "偵測到依賴變更，安裝中..."
  if ! pnpm install --frozen-lockfile 2>&1 | grep -E '(packages|warn|error|ERR)' | head -5; then
    warn "frozen-lockfile 失敗，嘗試一般安裝..."
    pnpm install || err "依賴安裝失敗"
  fi
  echo "$CURRENT_HASH" > "$LOCK_HASH_FILE"
  ok "套件已就緒"
fi

# ── 4. 啟動（單一實例 / 正式版）───────────────────────
# pnpm start:clean 一條龍：回收 port 3000 → 自癒 native 模組(ABI) → 遷移 DB
# → 正式建置 → 啟動。全部走 pnpm 鎖定的 Node 22，所以這裡不再手動 build/抢 port。
step "4/4  啟動伺服器（首次或改動後建置約 30–60 秒）"
PORT=3000
info "本地網址：http://localhost:$PORT"
info "按 Ctrl+C 停止服務"
echo ""

# 健康偵測 → 成功才開瀏覽器
(
  for i in $(seq 1 60); do
    sleep 2
    if curl -sf "http://localhost:$PORT" &>/dev/null; then
      echo "${GREEN}  ✓ 伺服器已就緒，開啟瀏覽器${NC}"
      open "http://localhost:$PORT"
      break
    fi
  done
) &

pnpm start:clean || err "啟動失敗"
