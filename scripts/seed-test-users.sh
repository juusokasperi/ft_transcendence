#!/usr/bin/env bash

# NOTE: designed to work only on the prod build

set -euo pipefail

# Configuration
CONTAINER_NAME="ft-transcendence-prod-backend-1"
DB_PATH="/data/db.sqlite"
PASSWORD="testPassword1!"  # Default password for all test users

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Test User Seeding Script ===${NC}"
echo ""

# Check if docker is available
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: docker command not found${NC}"
    exit 1
fi

# Check if uuidgen is available
if ! command -v uuidgen &> /dev/null; then
    echo -e "${RED}Error: uuidgen command not found${NC}"
    exit 1
fi

# Check if python3 is available
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Error: python3 command not found${NC}"
    exit 1
fi

# Check if backend container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Backend container '${CONTAINER_NAME}' is not running${NC}"
    echo "Available containers:"
    docker ps --format '{{.Names}}'
    exit 1
fi

echo -e "${GREEN}✓ Docker container found: ${CONTAINER_NAME}${NC}"
echo ""

# Generate bcrypt hash using Python
echo -e "${BLUE}Generating password hash...${NC}"
PASSWORD_HASH=$(python3 -c "
import bcrypt
import sys
password = '$PASSWORD'.encode('utf-8')
hashed = bcrypt.hashpw(password, bcrypt.gensalt(rounds=10))
print(hashed.decode('utf-8'))
")

if [ -z "$PASSWORD_HASH" ]; then
    echo -e "${RED}Error: Failed to generate password hash${NC}"
    echo "Make sure bcrypt is installed: pip3 install bcrypt"
    exit 1
fi

echo -e "${GREEN}✓ Password hash generated${NC}"
echo ""

# Define test users
declare -a USERS=(
    "test1:test1@example.com"
    "test2:test2@example.com"
    "test3:test3@example.com"
    "test4:test4@example.com"
    "test5:test5@example.com"
)

echo -e "${BLUE}Creating 5 test users...${NC}"
echo ""

# Create SQL insert statements
SQL_FILE=$(mktemp)
trap "rm -f $SQL_FILE" EXIT

for USER_DATA in "${USERS[@]}"; do
    IFS=':' read -r USERNAME EMAIL <<< "$USER_DATA"
    UUID=$(uuidgen | tr '[:upper:]' '[:lower:]')
    
    echo -e "${BLUE}  → ${USERNAME} (${EMAIL})${NC}"
    
    # Escape single quotes in password hash for SQL
    ESCAPED_HASH=$(echo "$PASSWORD_HASH" | sed "s/'/''/g")
    
    # Create INSERT statement
    cat >> "$SQL_FILE" << EOF
.param init
.param set :uuid '${UUID}'
.param set :username '${USERNAME}'
.param set :hash '${ESCAPED_HASH}'
.param set :email '${EMAIL}'
INSERT OR IGNORE INTO Users (uuid, username, password_hash, email, avatar, ranking)
VALUES (:uuid, :username, :hash, :email, NULL, 1000);
EOF
done

echo ""
echo -e "${BLUE}Executing SQL commands in container...${NC}"

# Execute SQL in the container
if docker exec -i "$CONTAINER_NAME" sqlite3 "$DB_PATH" < "$SQL_FILE"; then
    echo -e "${GREEN}✓ Successfully seeded test users!${NC}"
    echo ""
    echo -e "${BLUE}Test User Credentials:${NC}"
    echo "  Username: test1-test5"
    echo "  Email: test1@example.com - test5@example.com"
    echo "  Password: $PASSWORD"
    echo ""
    
    # Verify users were created
    echo -e "${BLUE}Verifying users in database...${NC}"
    docker exec "$CONTAINER_NAME" sqlite3 "$DB_PATH" \
        "SELECT username, email FROM Users WHERE username LIKE 'test%' ORDER BY username;"
    echo ""
    echo -e "${GREEN}✓ Done!${NC}"
else
    echo -e "${RED}Error: Failed to insert users into database${NC}"
    exit 1
fi
