FROM alpine:3

RUN apk add --no-cache curl jq

COPY ./setup.sh .

ENTRYPOINT ["./setup.sh"]
