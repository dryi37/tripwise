#!/usr/bin/env bash
set -Eeuo pipefail

SKIP_MIGRATIONS=false
for argument in "$@"; do
  case "$argument" in
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    --help|-h)
      printf 'Usage: bash scripts/start/ubuntu.sh [--skip-migrations]\n'
      exit 0
      ;;
    *) printf 'Tham số không hỗ trợ: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
COMPOSE_FILE="$BACKEND_DIR/docker-compose.yml"
BACKEND_PID=""
FRONTEND_PID=""

fail() {
  printf 'Lỗi: %s\n' "$1" >&2
  exit 1
}

cleanup() {
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || wait "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || wait "$FRONTEND_PID" 2>/dev/null || true
}

command -v docker >/dev/null 2>&1 || fail 'Cần cài Docker và Docker Compose.'
command -v node >/dev/null 2>&1 || fail 'Cần cài Node.js 24 trở lên.'
command -v npm >/dev/null 2>&1 || fail 'Không tìm thấy npm đi kèm Node.js.'
docker compose version >/dev/null 2>&1 || fail 'Không chạy được Docker Compose; hãy mở Docker Desktop hoặc cài Docker Compose.'

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  printf 'Đã tạo backend/.env từ file mẫu. Thêm API key vào file này nếu muốn dùng agent hoặc tìm kiếm web.\n'
fi

printf 'Đang khởi động PostgreSQL và Qdrant...\n'
docker compose -f "$COMPOSE_FILE" up -d

healthy() {
  local service="$1" container status
  container="$(docker compose -f "$COMPOSE_FILE" ps -q "$service")"
  [[ -n "$container" ]] || return 1
  status="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)"
  [[ "$status" == healthy ]]
}

for ((attempt = 0; attempt < 60; attempt++)); do
  if healthy postgres && healthy qdrant; then break; fi
  sleep 2
done
healthy postgres || fail 'PostgreSQL chưa sẵn sàng. Xem log bằng: docker compose -f backend/docker-compose.yml logs postgres'
healthy qdrant || fail 'Qdrant chưa sẵn sàng. Xem log bằng: docker compose -f backend/docker-compose.yml logs qdrant'

if [[ ! -x "$BACKEND_DIR/node_modules/.bin/tsx" ]]; then
  printf 'Đang cài dependencies backend lần đầu...\n'
  (cd "$BACKEND_DIR" && npm ci)
fi

printf 'Đang tạo Prisma client...\n'
(
  cd "$BACKEND_DIR"
  npm run prisma:generate
  if [[ "$SKIP_MIGRATIONS" == true ]]; then
    printf 'Bỏ qua migration theo yêu cầu (--skip-migrations).\n'
  else
    missing_migrations=()
    for migration_dir in prisma/migrations/*/; do
      [[ -f "${migration_dir}migration.sql" ]] || missing_migrations+=("${migration_dir%/}")
    done
    if ((${#missing_migrations[@]} > 0)); then
      fail "Migration thiếu migration.sql: ${missing_migrations[*]}. Bổ sung file trước khi khởi động để tránh schema lệch."
    fi
    printf 'Đang kiểm tra schema và áp dụng migration cho môi trường dev...\n'
    npx prisma migrate dev
  fi
)

printf '\nMở ứng dụng:\n  Frontend: http://127.0.0.1:8080\n  Backend:  http://127.0.0.1:3101/api/v1/health\n\nNhấn Ctrl+C để dừng backend và frontend.\n'
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

(cd "$BACKEND_DIR" && npm run dev) &
BACKEND_PID=$!
(cd "$ROOT_DIR" && node scripts/serve-static.cjs "$ROOT_DIR/frontend" 8080 127.0.0.1) &
FRONTEND_PID=$!

wait_for_http() {
  local url="$1" name="$2"
  for ((attempt = 0; attempt < 45; attempt++)); do
    if node -e 'fetch(process.argv[1]).then((response) => process.exit(response.status < 500 ? 0 : 1)).catch(() => process.exit(1))' "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null || ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
      fail "$name dừng trong lúc khởi động. Xem log phía trên."
    fi
    sleep 1
  done
  fail "$name chưa phản hồi sau 45 giây. Xem log phía trên."
}

wait_for_http 'http://127.0.0.1:3101/api/v1/health' 'Backend'
wait_for_http 'http://127.0.0.1:8080/' 'Frontend'
printf 'Backend và frontend đã phản hồi.\n'

wait -n "$BACKEND_PID" "$FRONTEND_PID"
