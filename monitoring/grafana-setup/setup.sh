#!/bin/sh
set -eu

# Generate a secure password using pwgen that meets the following criteria:
# - At least 12 characters (we use 16 for better security)
# - At least one uppercase letter (-c flag)
# - At least one lowercase letter (default)
# - At least one number (-n flag)
# - At least one special character (-y flag)
# - Excludes characters that can break JSON: backslash, double quote, single quote
generate_secure_password() {
  pwgen -s -c -n -y -r "\\\"\'" 16 1
}

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
    
    # Use jq to safely construct JSON payload, preventing injection issues
    JSON_PAYLOAD=$(jq -n \
      --arg name "${USER_NAME}" \
      --arg login "${USER_LOGIN}" \
      --arg password "${USER_PASS}" \
      --arg role "${USER_ROLE}" \
      '{name: $name, login: $login, password: $password, OrgId: 1, role: $role}')
    
    curl -s -X POST -u "${ADMIN_USER}:${ADMIN_PASS}" \
      "${GRAFANA_URL}/api/admin/users" \
      -H "Content-Type: application/json" \
      -d "${JSON_PAYLOAD}"
    
    echo ""
    echo "User '${USER_LOGIN}' created with role ${USER_ROLE}"
    echo "Generated password for '${USER_LOGIN}': ${USER_PASS}"
  fi
  echo ""
}

EDITOR_PASS=$(generate_secure_password)
VIEWER_PASS=$(generate_secure_password)

echo "Generated Passwords:"

# Create Editor user
create_user "${EDITOR_NAME}" "${EDITOR_NAME}" "${EDITOR_PASS}" "Editor"

# Create Viewer user
create_user "${VIEWER_NAME}" "${VIEWER_NAME}" "${VIEWER_PASS}" "Viewer"

echo "All users processed."
