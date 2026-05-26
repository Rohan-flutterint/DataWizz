#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
RUNTIME_DIR="$ROOT_DIR/.runtime"

MODE="${1:-auto}"
PROFILE="${2:-}"

mkdir -p "$RUNTIME_DIR"

log() {
  printf '[run.sh] %s\n' "$1"
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    log "Missing required command: $1"
    exit 1
  fi
}

port_in_use() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1
}

print_port_owner() {
  lsof -nP -iTCP:"$1" -sTCP:LISTEN || true
}

release_port() {
  local port="$1"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN | tr '\n' ' ' | xargs 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return 0
  fi

  log "Port $port is in use. Stopping existing process(es): $pids"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN || true
  kill $pids >/dev/null 2>&1 || true
  sleep 1

  if port_in_use "$port"; then
    log "Force stopping remaining process(es) on port $port"
    pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN | tr '\n' ' ' | xargs 2>/dev/null || true)"
    if [[ -n "$pids" ]]; then
      kill -9 $pids >/dev/null 2>&1 || true
      sleep 1
    fi
  fi

  if port_in_use "$port"; then
    log "Unable to free port $port"
    print_port_owner "$port"
    exit 1
  fi
}

start_docker() {
  require_cmd docker
  log "Starting Docker stack from $ROOT_DIR"
  if [[ "$PROFILE" == "superset" ]]; then
    docker compose --profile superset up --build
  else
    docker compose up --build
  fi
}

ensure_backend_env() {
  if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
    log "Creating backend virtual environment"
    python3 -m venv "$BACKEND_DIR/.venv"
  fi

  if [[ ! -f "$BACKEND_DIR/.venv/.deps-installed" ]]; then
    log "Installing backend dependencies"
    (
      cd "$BACKEND_DIR"
      source .venv/bin/activate
      pip install -e '.[dev]'
      touch .venv/.deps-installed
    )
  fi

  if [[ ! -f "$BACKEND_DIR/.env" && -f "$BACKEND_DIR/.env.example" ]]; then
    log "Creating backend .env from template"
    cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
  fi
}

ensure_frontend_env() {
  if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
    log "Installing frontend dependencies"
    (
      cd "$FRONTEND_DIR"
      npm install
    )
  fi

  if [[ ! -f "$FRONTEND_DIR/.env" && -f "$FRONTEND_DIR/.env.example" ]]; then
    log "Creating frontend .env from template"
    cp "$FRONTEND_DIR/.env.example" "$FRONTEND_DIR/.env"
  fi
}

start_local() {
  require_cmd python3
  require_cmd npm
  require_cmd lsof

  ensure_backend_env
  ensure_frontend_env

  local backend_log="$RUNTIME_DIR/backend.log"
  local frontend_log="$RUNTIME_DIR/frontend.log"
  local backend_pid_file="$RUNTIME_DIR/backend.pid"
  local frontend_pid_file="$RUNTIME_DIR/frontend.pid"
  local backend_port=8000
  local frontend_port=5173

  release_port "$backend_port"
  release_port "$frontend_port"

  log "Starting backend on http://localhost:$backend_port using SQLite for local demo mode"
  (
    cd "$BACKEND_DIR"
    source .venv/bin/activate
    DATABASE_URL=sqlite:///./local.db \
      uvicorn app.main:app --reload --host 0.0.0.0 --port "$backend_port"
  ) >"$backend_log" 2>&1 &
  echo $! >"$backend_pid_file"

  log "Starting frontend on http://localhost:$frontend_port"
  (
    cd "$FRONTEND_DIR"
    npm run dev -- --host 0.0.0.0 --port "$frontend_port" --strictPort
  ) >"$frontend_log" 2>&1 &
  echo $! >"$frontend_pid_file"

  cleanup() {
    log "Stopping local services"
    if [[ -f "$backend_pid_file" ]]; then
      kill "$(cat "$backend_pid_file")" >/dev/null 2>&1 || true
      rm -f "$backend_pid_file"
    fi
    if [[ -f "$frontend_pid_file" ]]; then
      kill "$(cat "$frontend_pid_file")" >/dev/null 2>&1 || true
      rm -f "$frontend_pid_file"
    fi
  }

  trap cleanup EXIT INT TERM

  log "Local platform is launching"
  log "Frontend: http://localhost:$frontend_port"
  log "Backend:  http://localhost:$backend_port"
  log "API Docs:  http://localhost:$backend_port/docs"
  log "Backend log:  $backend_log"
  log "Frontend log: $frontend_log"
  log "Press Ctrl+C to stop both services"

  wait
}

print_usage() {
  cat <<'EOF'
Usage:
  ./run.sh
  ./run.sh auto
  ./run.sh docker
  ./run.sh docker superset
  ./run.sh local

Modes:
  auto    Use Docker if available, otherwise run local demo mode
  docker  Start the Docker Compose stack
  local   Start backend + frontend locally with SQLite
EOF
}

case "$MODE" in
  auto)
    if command -v docker >/dev/null 2>&1; then
      start_docker
    else
      start_local
    fi
    ;;
  docker)
    start_docker
    ;;
  local)
    start_local
    ;;
  help|-h|--help)
    print_usage
    ;;
  *)
    log "Unknown mode: $MODE"
    print_usage
    exit 1
    ;;
esac
