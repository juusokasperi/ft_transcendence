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

# Set password for admin user 'elastic'
echo "Setting kibana_system password";
curl -s -X POST \
	--cacert /usr/share/elk/config/certs/ca/ca.crt \
	-u "elastic:${ELASTIC_PASSWORD}" \
	-H "Content-Type: application/json" \
	${ES_URL}/_security/user/kibana_system/_password \
	-d "{\"password\":\"${KIBANA_PASSWORD}\"}" 

echo "done configuring elasticsearch"
