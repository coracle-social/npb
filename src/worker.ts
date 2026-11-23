import { assoc, parseJson, removeUndefined } from "@welshman/lib";
import { Pool, request } from "@welshman/net";
import {
  tagSpec,
  tagValues,
  relayTags,
  matchTag,
  matchFilters,
  tagValue,
} from "@welshman/util";
import { deleteAlertByAddress } from "./database.js";
import { sendPush } from "./callback.js";
import { Alert } from "./alert.js";

const pool = new Pool();

const listenersByAddress = new Map();

const createListener = (alert: Alert) => {
  const { tags } = alert.event;
  const callback = tagValue(tagSpec("callback"), tags)!;
  const shouldIncludeEvent = Boolean(matchTag(tagSpec("include_event"), tags));
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
          const res = await sendPush(callback, {
            id: event.id,
            relay,
            event: shouldIncludeEvent ? event : undefined,
          });

          // Only a callback that says the subscription is gone gets it deleted, not one having a bad minute.
          if (res.status === 404) {
            await deleteAlertByAddress(alert.address);
            removeListener(alert);
          } else if (!res.ok) {
            console.log(
              `Callback at ${new URL(callback).host} answered ${res.status}`,
            );
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
