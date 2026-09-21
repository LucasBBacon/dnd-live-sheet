/**
 * The browser origin allowed to reach this server, for Express and Socket.IO
 * alike.
 *
 * One function rather than two copies of the default: the two used to
 * disagree, so a clone without CLIENT_URL got a working REST API and a socket
 * server that refused every connection (#64). Read at call time so tests can
 * vary the environment.
 * @returns CLIENT_URL, or the Vite dev server's origin when it is unset
 */
export const clientOrigin = (): string =>
  process.env.CLIENT_URL || "http://localhost:5173";
