FROM alpine:3.22

RUN apk add --no-cache curl jq pwgen

COPY ./setup.sh .

ENTRYPOINT ["./setup.sh"]
