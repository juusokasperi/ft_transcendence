#!/bin/sh

# non-zero exit will kill the whole script
set -e

#-----------------------------------------------------------------------------
# Add policies
#-----------------------------------------------------------------------------
echo "Setting ILM policy";
curl -s -u ${ELASTIC_USER}:${ELASTIC_PASSWORD} \
  --cacert /usr/share/elk/config/certs/ca/ca.crt \
  -X PUT \
  "${ES_URL}/_ilm/policy/timeseries_policy" \
  -H 'Content-Type: application/json' \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_primary_shard_size": "5GB",
            "max_age": "30d"
          },
          "set_priority": {
            "priority": 100
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "set_priority": {
            "priority": 50
          },
          "forcemerge": {
            "max_num_segments": 1
          },
          "readonly": {}
        }
      },
      "cold": {
        "min_age": "60d",
        "actions": {
          "set_priority": {
            "priority": 0
          }
        }
      },
      "delete": {
        "min_age": "90d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}'

#-----------------------------------------------------------------------------
# Misc. config
#-----------------------------------------------------------------------------

# Special user needed for Kibana
echo "Setting kibana_system password"
curl -s -X POST \
  --cacert /usr/share/elk/config/certs/ca/ca.crt \
  -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  ${ES_URL}/_security/user/kibana_system/_password \
  -d "{\"password\":\"${KIBANA_PASSWORD}\"}"

echo ""
echo "Creating developer user with read/write access"
curl -s -X POST \
  --cacert /usr/share/elk/config/certs/ca/ca.crt \
  -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  ${ES_URL}/_security/user/developer \
  -d '{
    "password": "'"${DEVELOPER_PASSWORD:-changeme}"'",
    "roles": ["editor", "kibana_admin"],
    "full_name": "Developer User",
    "email": "developer@example.com"
  }'

echo ""
echo "Creating analyst user with read-only access"
curl -s -X POST \
  --cacert /usr/share/elk/config/certs/ca/ca.crt \
  -u "elastic:${ELASTIC_PASSWORD}" \
  -H "Content-Type: application/json" \
  ${ES_URL}/_security/user/analyst \
  -d '{
    "password": "'"${ANALYST_PASSWORD:-changeme}"'",
    "roles": ["viewer", "monitoring_user"],
    "full_name": "Analyst User",
    "email": "analyst@example.com"
  }'

echo "done configuring elasticsearch"
