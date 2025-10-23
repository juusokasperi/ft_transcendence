#!/bin/sh

set -eu

echo "Creating Grafana user..."

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

