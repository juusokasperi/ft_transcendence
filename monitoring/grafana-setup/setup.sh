#!/bin/sh

apk add --no-cache curl jq

set -eu

start=$(date +%s)
timeout=30
echo "Waiting for Grafana to start..."
until curl -s "${GRAFANA_URL}/api/health" > /dev/null; do
  sleep 2
  now=$(date +%s)
  if (( now - start >= timeout )); then
    echo "Timed out after waiting for Grafana"
    exit 1
  fi
done

echo "Grafana is up, creating user..."

# Check if the user already exists
USER_ID=$(curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" \
  "${GRAFANA_URL}/api/users/lookup?loginOrEmail=${NEW_LOGIN}" \
  | jq -r '.id // empty')

if [ -n "$USER_ID" ]; then
  echo "User '${NEW_LOGIN}' already exists, skipping creation."
else
  echo "Creating new Editor user '${NEW_LOGIN}'..."
  curl -s -X POST -u "${ADMIN_USER}:${ADMIN_PASS}" \
    "${GRAFANA_URL}/api/admin/users" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"${NEW_NAME}\",
      \"login\": \"${NEW_LOGIN}\",
      \"password\": \"${NEW_PASS}\",
      \"OrgId\": 1,
      \"role\": \"Editor\"
    }"
  echo "User created"
fi

