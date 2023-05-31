import Server from "./server.js";

try {
  const wsServer = new Server();
  wsServer.start();
} catch (err) {
  console.error(err);
}
