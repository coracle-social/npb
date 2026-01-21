import { parseJson, identity } from "@welshman/lib";
import { request } from "@welshman/net";
import { getTagValues, getTagValue, normalizeRelayUrl } from "@welshman/util";
import { Alert } from "../alert.js";

const listenersByAddress = new Map();

const createListener = (alert: Alert) => {
  const server = getTagValue("server", alert.tags)!;
  const relays = getTagValues("relay", alert.tags).map(normalizeRelayUrl);
  const filters = getTagValues("filter", alert.tags)
    .map(parseJson)
    .filter(identity);
  const controller = new AbortController();
  const { signal } = controller;

  request({
    relays,
    filters,
    signal,
    onEvent: (event) => {
      fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event: alert.event,
          config: alert.tags,
        }),
      });
    },
  });

  return { stop: () => controller.abort() };
};

export const addListener = (alert: Alert) => {
  listenersByAddress.get(alert.address)?.stop();
  listenersByAddress.set(alert.address, createListener(alert));
};

export const removeListener = (alert: Alert) => {
  listenersByAddress.get(alert.address)?.stop();
  listenersByAddress.delete(alert.address);
};
