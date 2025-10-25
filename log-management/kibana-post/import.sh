#!/bin/sh

# non-zero exit will kill the whole script
set -e

echo "Waiting for Kibana to be ready..."
until curl -s "${KIBANA_URL}/api/status" | grep -q '"level":"available"'; do
  sleep 5
done

echo "Checking for existing data views..."

EXISTS=$(curl -s \
	-u "${ELASTIC_USER}:${ELASTIC_PASSWORD}" \
	-H "kbn-xsrf: true" \
	"${KIBANA_URL}/api/data_views" \
	| grep -c "logstash" || true) # do not kill the script if false

if [ "$EXISTS" -gt 0 ]; then
  echo "Data view already exists, skipping import."
else
	echo "Importing data views..."
	curl -s -X POST "${KIBANA_URL}/api/saved_objects/_import" \
	  -u "${ELASTIC_USER}:${ELASTIC_PASSWORD}" \
	  -H "kbn-xsrf: true" \
	  --form file=@/data/logstash.ndjson

	echo "Data views imported"
fi
