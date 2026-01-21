import "dotenv/config";
import { Nip01Signer } from "@welshman/signer";

if (!process.env.SECRET) throw new Error("SECRET is not defined.");
if (!process.env.PORT) throw new Error("PORT is not defined.");

export const appSigner = Nip01Signer.fromSecret(process.env.SECRET);
export const PORT = process.env.PORT;

appSigner.getPubkey().then((pubkey) => {
  console.log(`Running as ${pubkey}`);
});
