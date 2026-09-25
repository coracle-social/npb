import { assoc, parseJson, removeUndefined } from "@welshman/lib";
import { Pool, request } from "@welshman/net";
import {
  tagSpec,
  tagValues,
  relayTags,
  matchFilters,
  tagValue,
} from "@welshman/util";
import { deleteAlertByAddress } from "./database.js";
import { Alert } from "./alert.js";

const pool = new Pool();

const listenersByAddress = new Map();

const createListener = (alert: Alert) => {
  const { tags } = alert.event;
  const callback = tagValue(tagSpec("callback"), tags)!;
  const relays = tagValues(relayTags("relay"), tags);
  const ignore = removeUndefined(
    tagValues(tagSpec("ignore"), tags).map(parseJson),
  );
  const filters = removeUndefined(
    tagValues(tagSpec("filter"), tags).map(parseJson),
  ).map(assoc("limit", 0));
  const controller = new AbortController();
  const { signal } = controller;

  request({
    relays,
    filters,
    signal,
    context: { pool },
    onEvent: async (event, relay) => {
      if (!matchFilters(ignore, event)) {
        console.log(`Forwarding event ${event.id} from ${relay}`);

        try {
          const res = await fetch(callback, {
            method: "POST",
            body: JSON.stringify({ id: event.id, relay }),
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (!res.ok) {
            deleteAlertByAddress(alert.address);
            removeListener(alert);
          }
        } catch (e) {
          const { hostname } = new URL(callback);

          console.log(`Failed to fetch callback at ${hostname}`);
        }
      }
    },
  });

  return { stop: () => controller.abort() };
};

export const addListener = (alert: Alert) => {
  console.log("registering alert", alert.address);

  listenersByAddress.get(alert.address)?.stop();
  listenersByAddress.set(alert.address, createListener(alert));
};

export const removeListener = (alert: Alert) => {
  console.log("unregistering alert", alert.address);

  listenersByAddress.get(alert.address)?.stop();
  listenersByAddress.delete(alert.address);
};
