import { SignedEvent } from "@welshman/util";

export const ALERT = 30390;

export type Alert = {
  address: string;
  id: string;
  pubkey: string;
  created_at: number;
  event: SignedEvent;
};
