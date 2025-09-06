#!/bin/sh
set -e

echo "Waiting for Kibana to be ready..."
until curl -s http://kibana:5601/api/status | grep -q '"level":"available"'; do
  sleep 5
done

echo "Importing data views..."
curl -X POST "http://kibana:5601/api/saved_objects/_import" \
  -u ${ELASTIC_USER}:${ELASTIC_PASSWORD} \
  -H "kbn-xsrf: true" \
  --form file=@/data/logstash.ndjson

echo "Data views imported"
