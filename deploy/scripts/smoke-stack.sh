#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$DEPLOY_DIR"

PORT="${GATEWAY_PUBLIC_PORT:-8080}"
BASE="http://127.0.0.1:${PORT}"
SMOKE_USER="${SMOKE_USER:-demo}"
SMOKE_PASSWORD="${SMOKE_PASSWORD:-}"

if [[ -z "$SMOKE_PASSWORD" ]]; then
  echo "Set SMOKE_PASSWORD (gateway user from users.yaml)." >&2
  exit 1
fi

node scripts/check-stack.mjs

echo "==> docker compose up -d --build"
docker compose up -d --build

cleanup() {
  docker compose down
}
trap cleanup EXIT

echo "==> wait for gateway health"
for _ in $(seq 1 60); do
  if curl -sf "${BASE}/health/live" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
curl -sf "${BASE}/health/live" >/dev/null || { echo "gateway not healthy"; exit 1; }

JAR="$(mktemp)"
echo "==> login"
curl -sf -c "$JAR" -X POST "${BASE}/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASSWORD}\"}" >/dev/null

echo "==> gerace objectQuery count"
RESP="$(curl -sf -b "$JAR" -X POST "${BASE}/t/gerace/v1/query/objects" \
  -H 'Content-Type: application/json' \
  -d '{"objectId":"contract","mode":"count","filters":{"source_year_month":"2025-06"}}')"
echo "$RESP" | head -c 200
echo ""
ROW_COUNT="$(node -e "const j=JSON.parse(process.argv[1]); console.log(j.rowCount??0)" "$RESP")"
if [[ "$ROW_COUNT" -le 0 ]]; then
  echo "Expected rowCount > 0 for gerace contracts 2025-06" >&2
  exit 1
fi

echo "==> backed list entities"
curl -sf -b "$JAR" "${BASE}/t/backed/v1/model/entities" >/dev/null

echo "==> audit log in volume"
AUDIT_LINES="$(docker compose exec -T platform-api sh -c 'wc -l < /var/log/anchor/audit.jsonl' 2>/dev/null || echo 0)"
if [[ "$AUDIT_LINES" -le 0 ]]; then
  echo "Expected audit.jsonl lines in platform-api volume" >&2
  exit 1
fi

echo "smoke-stack: OK (audit lines: ${AUDIT_LINES})"
