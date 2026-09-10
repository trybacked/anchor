#!/usr/bin/env bash
# Post-deploy smoke: health, openapi, submit CSV, poll until done.
# Requires AI_GATEWAY_API_KEY on the service for the pipeline to finish.
set -euo pipefail

BASE_URL="${WORKER_SERVICE_URL:-http://127.0.0.1:8790}"
TOKEN="${WORKER_SERVICE_AUTH_TOKEN:?Set WORKER_SERVICE_AUTH_TOKEN}"
TENANT_ID="${WORKER_SERVICE_SMOKE_TENANT:-smoke-tenant}"
POLL_SECONDS="${WORKER_SERVICE_SMOKE_TIMEOUT:-120}"

echo "==> health"
health="$(curl -fsS "${BASE_URL}/health")"
echo "${health}"
echo "${health}" | grep -q '"ok":true'
echo "${health}" | grep -q '"dataRootWritable":true'
echo "${health}" | grep -q '"version":'

echo "==> openapi"
curl -fsS "${BASE_URL}/openapi.yaml" | head -n 1 | grep -q "openapi:"

echo "==> submit run"
boundary="----backed-smoke-$(date +%s)"
body=$'--'"${boundary}"$'\r\nContent-Disposition: form-data; name="file"; filename="smoke.csv"\r\n\r\nid,name\r\n1,Smoke\r\n--'"${boundary}"$'--\r\n'
submit="$(curl -fsS -X POST "${BASE_URL}/v1/tenants/${TENANT_ID}/runs" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: multipart/form-data; boundary=${boundary}" \
  --data-binary "${body}")"
echo "${submit}"
run_id="$(printf '%s' "${submit}" | sed -n 's/.*"runId":"\([^"]*\)".*/\1/p')"
if [ -z "${run_id}" ]; then
  echo "Failed to parse runId from: ${submit}" >&2
  exit 1
fi

echo "==> poll run ${run_id}"
deadline=$((SECONDS + POLL_SECONDS))
status=""
while [ "${SECONDS}" -lt "${deadline}" ]; do
  payload="$(curl -fsS "${BASE_URL}/v1/tenants/${TENANT_ID}/runs/${run_id}" \
    -H "Authorization: Bearer ${TOKEN}")"
  status="$(printf '%s' "${payload}" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
  echo "${payload}"
  if [ "${status}" = "done" ] || [ "${status}" = "failed" ]; then
    break
  fi
  sleep 2
done

if [ "${status}" != "done" ]; then
  echo "Run did not complete successfully (status=${status:-unknown})" >&2
  exit 1
fi

echo "==> smoke passed"
