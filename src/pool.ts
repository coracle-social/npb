import { on, call, omit, now, ago } from "@welshman/lib";
import {
  Pool,
  Socket,
  SocketEvent,
  SocketStatus,
  ClientMessage,
  makeSocket,
  isClientReq,
  isClientClose,
  isRelayClosed,
  socketPolicyPing,
  socketPolicyAuthBuffer,
  socketPolicyConnectOnSend,
} from "@welshman/net";

const MAX_BACKOFF = 5 * 60_000;

// Replaces welshman's socketPolicyCloseInactive, which reconnects with no delay once a socket
// has been open for more than 5 seconds. When a relay goes down that spins in a tight loop and
// piles a copy of every pending req onto the send queue on each attempt. Instead, back off
// exponentially and only resubscribe once the socket is actually open again.
const socketPolicyReconnect = (socket: Socket) => {
  const reqs = new Map<string, ClientMessage>();

  let attempts = 0;
  let lastActivity = now();
  let since: number | undefined;
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const unsubscribers = [
    on(socket, SocketEvent.Status, (status: SocketStatus) => {
      if (status === SocketStatus.Open && since) {
        for (const [verb, id, ...filters] of reqs.values()) {
          // limit 0 would skip anything published while we were disconnected
          socket.send([
            verb,
            id,
            ...filters.map((f: object) => ({ ...omit(["limit"], f), since })),
          ]);
        }

        since = undefined;
      }

      const isClosed = [SocketStatus.Closed, SocketStatus.Error].includes(
        status,
      );

      if (isClosed && reqs.size > 0 && !timeout) {
        since = since || now();
        timeout = setTimeout(
          () => {
            timeout = undefined;
            socket.attemptToOpen();
          },
          Math.min(MAX_BACKOFF, 1000 * 2 ** attempts++),
        );
      }
    }),
    on(socket, SocketEvent.Send, (message: ClientMessage) => {
      lastActivity = now();

      if (isClientReq(message)) {
        reqs.set(message[1], message);
      }

      if (isClientClose(message)) {
        reqs.delete(message[1]);
      }
    }),
    on(socket, SocketEvent.Receive, (message: ClientMessage) => {
      lastActivity = now();
      attempts = 0;

      if (isRelayClosed(message)) {
        reqs.delete(message[1]);
      }
    }),
  ];

  const interval = setInterval(() => {
    if (
      socket.status === SocketStatus.Open &&
      reqs.size === 0 &&
      lastActivity < ago(30)
    ) {
      socket.close();
    }
  }, 3000);

  return () => {
    unsubscribers.forEach(call);
    clearInterval(interval);
    clearTimeout(timeout);
  };
};

export const pool = new Pool({
  makeSocket: (url: string) =>
    makeSocket(url, [
      socketPolicyPing,
      socketPolicyAuthBuffer,
      socketPolicyConnectOnSend,
      socketPolicyReconnect,
    ]),
});
