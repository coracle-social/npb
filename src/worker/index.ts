import { Alert } from "../alert.js";
import { addListener, removeListener } from "./push.js";

export const registerAlert = (alert: Alert) => {
  console.log("registering job", alert.address);

  addListener(alert);
};

export const unregisterAlert = (alert: Alert) => {
  console.log("unregistering job", alert.address);

  removeListener(alert);
};
