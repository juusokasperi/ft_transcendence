FROM curlimages/curl:8.7.1

COPY logstash.ndjson /data/logstash.ndjson
COPY import.sh /init/import.sh

ENTRYPOINT ["/init/import.sh"]
