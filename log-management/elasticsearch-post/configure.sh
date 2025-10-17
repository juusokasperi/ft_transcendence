#!/bin/sh

# non-zero exit will kill the whole script
set -e

curl -u ${ELASTIC_USER}:${ELASTIC_PASSWORD} \
  --cacert /usr/share/elk/config/certs/ca/ca.crt \
  -X PUT \
  "https://elasticsearch:${ES_PORT}/_ilm/policy/timeseries_policy" \
  -H 'Content-Type: application/json' \
  -d '{
  "policy": {
    "phases": {
      "hot": {
        "actions": {
          "rollover": {
            "max_primary_shard_size": "50GB",
            "max_age": "30d"
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

echo "done configuring elasticsearch"
