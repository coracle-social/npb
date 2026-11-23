import { guardedFetch, guardedFetchText } from "guarded-fetch";
import { randomId } from "@welshman/lib";
import type { TrustedEvent } from "@welshman/util";

const MAX_BODY_LENGTH = 1024;

// A callback proves it wants pushes by echoing a challenge, so nobody can aim a subscription at a third party.
export const verifyCallback = async (callback: string) => {
  const url = URL.parse(callback);

  if (!url) {
    return false;
  }

  const challenge = randomId();

  url.searchParams.set("challenge", challenge);

  try {
    const body = await guardedFetchText(url, {
      redirect: "manual",
      throwOnHttpError: true,
      maxResponseBytes: MAX_BODY_LENGTH,
      headers: { Accept: "text/plain" },
    });

    return body.trim() === challenge;
  } catch (e) {
    console.log(`Failed to verify callback at ${url.host}:`, String(e));

    return false;
  }
};

export type PushPayload = {
  id: string;
  relay: string;
  event?: TrustedEvent;
};

export const sendPush = (callback: string, payload: PushPayload) =>
  guardedFetch(callback, {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  });
