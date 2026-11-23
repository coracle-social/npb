# Nostr Push Bridge

This is a minimal nostr relay implementation which accepts `kind 30390` [push subscription events](https://github.com/nostr-protocol/nips/pull/2194) on behalf of public relays.

Before accepting a subscription, the bridge sends a `GET` to its `callback` with a random `challenge` query parameter, and rejects it unless the callback echoes the challenge back with a `2xx` status. A subscription is only verified when it is new or its callback changed, so client settings changes don't wait on the callback.

The bridge refuses to connect to a callback that is, or resolves to, a private or loopback address, including after a redirect.

The bridge reads events from relays over unauthenticated connections, so it ignores `ignore_self`; it does push the connected user's own events, including the sender's copies of their own [NIP 17](https://github.com/nostr-protocol/nips/blob/master/17.md) messages. It does support `ignore`, `include_event`, and forwards the normalized URL of the relay the event was seen on as `relay`.

## Configuration

The following env variables are accepted:

- `PORT` - the port to run the server on
- `SECRET` - a hex secret key for the relay's identity
- `DATA_DIR` - a directory where the sqlite database should be stored (defaults to `.`)
- `CORS_DOMAIN` - restrict domains able to connect (defaults to `*`)
