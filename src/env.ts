import "dotenv/config";
import { makeSecret } from "@welshman/util";
import { Nip01Signer } from "@welshman/signer";

export const PORT = process.env.PORT || 3000;
export const SECRET = process.env.SECRET || makeSecret();
export const DATA_DIR = process.env.DATA_DIR || ".";
export const CORS_DOMAIN = process.env.CORS_DOMAIN || "*";

export const signer = Nip01Signer.fromSecret(SECRET);

signer.getPubkey().then((pubkey) => {
  console.log(`Running as ${pubkey}`);
});
