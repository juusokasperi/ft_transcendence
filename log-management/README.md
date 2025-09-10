# Log management

Uses the ELK stack from Elastic. Logs are passed from docker -> GELF driver -> logstash -> elasticsearch. Kibana is the frontend.

## Usage

1. Run `cp .env.example .env`
2. Run `make elk-detached` to start the normal dev stack and the ELK stack (the stack is kinda heavy so you can still do `make detached` and just run the normal dev environment without ELK).
3. Open the browser at `localhost:8080` to generate some logs
4. Open the browser at `localhost:5601`
5. Log in as `elastic` with password `changeme`
6. Click on the hamburger menu, then on `Discover` to see your logs.

If you play around and end up creating some nice dashboard, it can probably be exported as JSON and then imported during build time. Let me know.

## TODO

- Route everything through nginx, so no extra ports need to be exposed.
- Start ELK stack first, so we dont miss logs from startup.
- Persist data on bind mounts?
- Create less privileged user?
- Create nice premade dashboard.
- Github Actions
