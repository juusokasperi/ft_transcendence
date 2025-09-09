# default value should make the build fail if this variable not set
ARG STACK_VERSION=UNSET_VERSION
FROM docker.elastic.co/logstash/logstash:${STACK_VERSION}
COPY ./logstash.conf /usr/share/logstash/pipeline/
