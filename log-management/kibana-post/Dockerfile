FROM curlimages/curl:8.16.0

COPY logstash.ndjson /data/logstash.ndjson
COPY import.sh /init/import.sh

ENTRYPOINT ["/init/import.sh"]
