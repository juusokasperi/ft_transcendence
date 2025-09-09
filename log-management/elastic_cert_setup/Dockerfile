# default value should make the build fail if this variable not set
ARG STACK_VERSION=UNSET_VERSION
FROM docker.elastic.co/elasticsearch/elasticsearch:${STACK_VERSION}
COPY setup.sh /usr/local/bin/setup.sh
CMD ["/usr/local/bin/setup.sh"]
