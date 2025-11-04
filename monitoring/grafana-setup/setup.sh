#!/bin/sh
set -eu

create_user() {
  local USER_NAME=$1
  local USER_LOGIN=$2
  local USER_PASS=$3
  local USER_ROLE=$4
  
  echo "Creating Grafana user '${USER_LOGIN}'..."
  
  # Check if the user already exists
  USER_ID=$(curl -s -u "${ADMIN_USER}:${ADMIN_PASS}" \
    "${GRAFANA_URL}/api/users/lookup?loginOrEmail=${USER_LOGIN}" \
    | jq -r '.id // empty')
  
  if [ -n "$USER_ID" ]; then
    echo "User '${USER_LOGIN}' already exists, skipping creation."
  else
    echo "Creating new ${USER_ROLE} user '${USER_LOGIN}'..."
    curl -s -X POST -u "${ADMIN_USER}:${ADMIN_PASS}" \
      "${GRAFANA_URL}/api/admin/users" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"${USER_NAME}\",
        \"login\": \"${USER_LOGIN}\",
        \"password\": \"${USER_PASS}\",
        \"OrgId\": 1,
        \"role\": \"${USER_ROLE}\"
      }"
    echo "User '${USER_LOGIN}' created with role ${USER_ROLE}"
  fi
  echo ""
}

# Create Editor user
create_user "${EDITOR_NAME}" "editor" "${EDITOR_PASS}" "Editor"

# Create Viewer user
create_user "${VIEWER_NAME}" "viewer" "${VIEWER_PASS}" "Viewer"

echo "All users processed."
