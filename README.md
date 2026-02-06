# Nostr Push Bridge

This is a minimal nostr relay implementation which accepts `kind 30390` [push subscription events](https://github.com/nostr-protocol/nips/pull/2194) on behalf of public relays.

## Configuration

The following env variables are required:

- `PORT` - the port to run the server on
- `SECRET` - a hex secret key for the relay's identity

The following env variables are optional:

- `DATA_DIR` - a directory where the sqlite database should be stored (defaults to `.`)
- `CORS_DOMAIN` - restrict domains able to connect (defaults to `*`)
