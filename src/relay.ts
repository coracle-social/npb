import { WebSocket } from "ws";
import { decrypt } from "@welshman/signer";
import { parseJson, ago, MINUTE, randomId } from "@welshman/lib";
import type { SignedEvent, Filter } from "@welshman/util";
import {
  DELETE,
  CLIENT_AUTH,
  matchFilters,
  getTagValue,
  getTagValues,
  verifyEvent,
} from "@welshman/util";
import { appSigner } from "./env.js";
import { ALERT } from "./alert.js";
import { getAlertsForPubkey } from "./database.js";
import { addAlert, processDelete } from "./actions.js";

type AuthState = {
  challenge: string;
  event?: SignedEvent;
};

type RelayMessage = [string, ...any[]];

export class Connection {
  private _socket: WebSocket;
  private _hostname: string;
  private _subs = new Map<string, Filter[]>();

  auth: AuthState = {
    challenge: randomId(),
    event: undefined,
  };

  constructor(socket: WebSocket, hostname: string) {
    this._socket = socket;
    this._hostname = hostname;
    this.send(["AUTH", this.auth.challenge]);
  }

  cleanup() {
    this._subs.clear();
    this._socket.removeAllListeners("message");
    this._socket.removeAllListeners("error");
    this._socket.removeAllListeners("close");
    this._socket.close();
  }

  send(message: RelayMessage) {
    this._socket.send(JSON.stringify(message));
  }

  handle(message: WebSocket.Data) {
    let parsedMessage: RelayMessage;
    try {
      parsedMessage = JSON.parse(message.toString());
    } catch (e) {
      this.send(["NOTICE", "", "Unable to parse message"]);
      return;
    }

    let verb: string;
    let payload: any[];
    try {
      [verb, ...payload] = parsedMessage;
    } catch (e) {
      this.send(["NOTICE", "", "Unable to read message"]);
      return;
    }

    const handler = this[`on${verb}` as keyof Connection] as
      | ((...args: any[]) => Promise<void>)
      | undefined;

    if (handler) {
      handler.call(this, ...payload);
    } else {
      this.send(["NOTICE", "", `Unable to handle ${verb} message`]);
    }
  }

  async onAUTH(event: SignedEvent) {
    if (!verifyEvent(event)) {
      return this.send(["OK", event.id, false, "invalid signature"]);
    }

    if (event.kind !== CLIENT_AUTH) {
      return this.send(["OK", event.id, false, "invalid kind"]);
    }

    if (event.created_at < ago(5, MINUTE)) {
      return this.send([
        "OK",
        event.id,
        false,
        "created_at is too far from current time",
      ]);
    }

    if (getTagValue("challenge", event.tags) !== this.auth.challenge) {
      return this.send(["OK", event.id, false, "invalid challenge"]);
    }

    if (!getTagValue("relay", event.tags)?.includes(this._hostname)) {
      return this.send(["OK", event.id, false, "invalid relay"]);
    }

    this.auth.event = event;

    this.send(["OK", event.id, true, ""]);
  }

  async onREQ(id: string, ...filters: Filter[]) {
    if (!this.auth.event) {
      return this.send(["CLOSED", id, `auth-required: alerts are protected`]);
    }

    this._subs.set(id, filters);

    for (const alert of await getAlertsForPubkey(this.auth.event.pubkey)) {
      if (matchFilters(filters, alert.event)) {
        this.send(["EVENT", id, alert.event]);
      }
    }

    this.send(["EOSE", id]);
  }

  async onCLOSE(id: string) {
    this._subs.delete(id);
  }

  async onEVENT(event: SignedEvent) {
    if (!verifyEvent(event)) {
      return this.send(["OK", event.id, false, "Invalid signature"]);
    }

    if (event.pubkey !== this.auth.event?.pubkey) {
      return this.send(["OK", event.id, false, "Event not authorized"]);
    }

    try {
      if (event.kind === DELETE) {
        await this.handleDelete(event);
      } else if (event.kind === ALERT) {
        await this.handleAlertRequest(event);
      } else {
        this.send(["OK", event.id, false, "Event kind not accepted"]);
      }
    } catch (e) {
      this.send(["OK", event.id, false, "Unknown error"]);
      throw e;
    }
  }

  private async handleDelete(event: SignedEvent) {
    await processDelete({ event });

    this.send(["OK", event.id, true, ""]);
  }

  private async handleAlertRequest(event: SignedEvent) {
    const pubkey = await appSigner.getPubkey();

    if (!getTagValues("p", event.tags).includes(pubkey)) {
      return this.send(["OK", event.id, false, "Event must p-tag this relay"]);
    }

    let plaintext: string;
    try {
      plaintext = await decrypt(appSigner, event.pubkey, event.content);
    } catch (e) {
      return this.send([
        "OK",
        event.id,
        false,
        "Failed to decrypt event content",
      ]);
    }

    const tags = parseJson(plaintext);

    if (!Array.isArray(tags)) {
      return this.send([
        "OK",
        event.id,
        false,
        "Encrypted tags are not an array",
      ]);
    }

    const alert = await addAlert({ event, tags });

    this.send(["OK", event.id, true, ""]);

    for (const [id, filters] of this._subs) {
      if (matchFilters(filters, alert.event)) {
        this.send(["EVENT", id, alert.event]);
      }
    }
  }
}
