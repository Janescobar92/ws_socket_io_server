import * as fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { createServer as createHttpsServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { Server } from "socket.io";

import EVENTS from "./constants/events.js";
import ROOMS from "./constants/rooms.js";
import { SS_CONNECTED, SS_DISCONNECTED } from "./constants/message.js";

import {
  httpPort,
  httpsPort,
  sslOptions,
  staticContentPath,
} from "./config.js";
import CertificateManager from "./certificateManager.js";
import CertificateDownloadManager from "./certificateDownloadManager.js";

// Destructuring to extract constants from the imported EVENTS and ROOMS objects.
const {
  CONNECTION,
  DISCONNECT,
  TO_ROOM_EVENT,
  REGISTER_CLIENT,
  RESTART_SERVER,
  SENT_FROM_SERVER,
  SHUT_DOWN,
} = EVENTS;

const { SECOND_SCREEN, TPV } = ROOMS;

/**
 * Represents a WebSocket server.
 */
class WsSocketServer {
  constructor() {
    const { certPem, privateKeyPem } = this.generateCertificate();

    const options = {
      key: privateKeyPem,
      cert: certPem,
      rejectUnauthorized: false,
    };

    console.log({ options });

    // Ports for HTTP and HTTPS servers.
    this.httpPort = httpPort;
    this.httpsPort = httpsPort;

    // Express application setup with CORS and static file middleware.
    this.app = express();
    this.app.use(cors(), express.static(staticContentPath));

    // Creating HTTP and HTTPS servers.
    this.httpServer = createHttpServer(this.app);
    this.httpsServer = createHttpsServer(options, this.app);

    // Certificate and key.
    this.certPem = certPem;
    this.privateKeyPem = privateKeyPem;

    // Socket.IO setup with CORS configuration.
    this.io = new Server({
      cors: {
        origin: "*",
      },
    });

    // Attach Socket.IO to both HTTP and HTTPS servers.
    this.io.attach(this.httpServer);
    this.io.attach(this.httpsServer);

    // Configuration paths for server initialization.
    this.folderPath = "./config";
    this.initFileName = "init.json";
    this.fullInitPath = path.join(this.folderPath, this.initFileName);

    // List to keep track of connected clients.
    this.connectedClients = [];
  }

  /**
   * Retrieves the network IP address of the server.
   * @returns {string} The IP address.
   */
  getNetworkIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === "IPv4" && !iface.internal) {
          return iface.address;
        }
      }
    }
    return "0.0.0.0";
  }

  /**
   * Starts the WebSocket server and listens on specified HTTP and HTTPS ports.
   */
  start() {
    // Setup for Socket.IO connection handling.
    this.io.on(CONNECTION, (socket) => {
      this.clientConnected();
      const events = Object.values(EVENTS);
      events.forEach((event) => {
        socket.on(event, (data) => this.customSocketEvent(event, socket, data));
      });
    });

    // Start listening on HTTP and HTTPS ports.
    this.httpServer.listen(this.httpPort, () => {
      this.serverLog(
        `HTTP Server listening on http://localhost:${this.httpPort}`,
        true
      );
      this.checkConnectedClients();
    });

    this.httpsServer.listen(this.httpsPort, () => {
      this.serverLog(
        `HTTPS Server listening on https://${this.getNetworkIP()}:${
          this.httpsPort
        }`,
        true
      );
      this.checkConnectedClients();
    });

    // Enable additional endpoints.
    this.enableEndpoints();
  }

  /**
   * Method to handle server shutdown.
   * @param {Socket} socket - The socket instance.
   * @param {boolean} restart - Flag to restart the server after shutdown.
   */
  async shutdown(socket, restart = false) {
    this.serverLog("Shutting down server...", true);
    this.httpServer.close(() => {
      this.serverLog("WsSocketServer successfully shut down", true);
      if (restart) {
        this.start();
      } else {
        process.exit(0);
      }
    });
    this.httpsServer.close(() => {
      this.serverLog("WsSocketServer successfully shut down", true);
      if (restart) {
        this.start();
      } else {
        process.exit(0);
      }
    });
    await socket.disconnect();
  }

  /**
   * Restart the server.
   * @param {Socket} socket - The socket instance.
   */
  async restartServer(socket) {
    await this.shutdown(socket, true);
  }

  /**
   * Logs when a client connects.
   */
  clientConnected() {
    this.serverLog("A client has connected", true);
  }

  /**
   * Handles client disconnection.
   * @param {Socket} socket - The socket instance of the disconnected client.
   */
  clientDisconnected(socket) {
    this.serverLog("A client has been disconnected", true);
    this.connectedClients = this.connectedClients.filter(
      (s) => s.socket_id !== socket.id
    );
  }

  /**
   * Register a client to a specific room.
   * @param {Socket} socket - The socket instance of the client.
   * @param {string} room - The room to join.
   */
  register(socket, room) {
    socket.join(room);
    this.serverLog(`Client registered in room ${room}`, true);
    this.connectedClients.push({ socket_id: socket.id, room });
  }

  /**
   * Emit events to a specific room.
   * @param {Socket} socket - The socket instance.
   * @param {string} data - Data to be emitted.
   */
  emitRoomEvent(socket, data) {
    const payload = JSON.parse(data);
    const { room, roomEvent } = payload;
    this.serverLog({ room, roomEvent, data }, true);
    socket.to(room).emit(roomEvent, data);
  }

  /**
   * Custom event handling for Socket.IO.
   * @param {string} eventType - The type of the event.
   * @param {Socket} socket - The socket instance.
   * @param {string} data - Data associated with the event.
   */
  customSocketEvent(eventType, socket, data) {
    switch (eventType) {
      case CONNECTION:
        return this.clientConnected();
      case DISCONNECT:
        return this.clientDisconnected(socket);
      case SHUT_DOWN:
        return this.shutdown(socket);
      case RESTART_SERVER:
        return this.restartServer(socket);
      case TO_ROOM_EVENT:
        return this.emitRoomEvent(socket, data);
      case REGISTER_CLIENT:
        return this.register(socket, data);
      default:
        break;
    }
  }

  /**
   * Checks if there are clients in a specific room.
   * @param {string} room - The room to check.
   * @returns {boolean} True if there are clients in the room.
   */
  areThereClientsInRoom(room) {
    return this.connectedClients.some((client) => client.room === room);
  }

  /**
   * Performs a health check on the server.
   */
  healthCheck() {
    if (!this.connectedClients.length) return;
    const isTPVOnline = this.areThereClientsInRoom(TPV);
    const isSScreenOnline = this.areThereClientsInRoom(SECOND_SCREEN);

    const emitTo = [
      ...(isTPVOnline ? [TPV] : []),
      ...(isSScreenOnline ? [SECOND_SCREEN] : []),
    ];

    if (!!emitTo.length) {
      this.io.to(emitTo).emit(
        SENT_FROM_SERVER,
        JSON.stringify({
          messague: isSScreenOnline ? SS_CONNECTED : SS_DISCONNECTED,
          ss_connected: isSScreenOnline,
        })
      );
    }
  }

  /**
   * Periodically checks connected clients.
   */
  checkConnectedClients() {
    setInterval(() => {
      this.serverLog(
        {
          connectedClients: this.connectedClients,
        },
        true
      );
      this.healthCheck();
    }, 10000);
  }

  /**
   * Defines status endpoint.
   */
  statusEndpoint() {
    this.app.get("/status", (req, res) => {
      const status = {
        connectedClients: this.connectedClients.length,
        isTPVOnline: this.areThereClientsInRoom(TPV),
        isSScreenOnline: this.areThereClientsInRoom(SECOND_SCREEN),
      };
      res.json(status);
    });
  }

  /**
   * Defines regenerate-certificate endpoint.
   */
  regenerateCertificateEndpoint() {
    this.app.get("/regenerate-certificate", async (req, res) => {
      const { certPem, privateKeyPem } = this.generateCertificate(true);
      this.certPem = certPem;
      this.privateKeyPem = privateKeyPem;
      console.log({ certPem, privateKeyPem });
      return res.json({ message: "New certificate generated and applied." });
    });
  }

  /**
   * Defines download-certificate endpoint.
   */
  downloadCertificates() {
    this.app.get("/download-certificate", async (req, res) => {
      try {
        CertificateDownloadManager.donwload(
          this.certPem,
          this.privateKeyPem,
          res
        );
      } catch (error) {
        this.serverLog(error);
      }
    });
  }

  /**
   * Serves the landing page.
   */
  landig() {
    this.app.get("/", (req, res) => {
      const indexPath = path.join(__dirname, publicPath, "index.html");
      const content = fs.readFileSync(indexPath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    });
  }

  /**
   * Enables various HTTP endpoints.
   */
  enableEndpoints() {
    this.landig();
    this.statusEndpoint();
    this.regenerateCertificateEndpoint();
    this.downloadCertificates();
    // Other endpoints can be added here...
  }

  /**
   * Generates a self-signed certificate.
   * @param {boolean} updateServer
   * @returns
   */
  generateCertificate(updateServer = false) {
    const { certPem, privateKeyPem } =
      CertificateManager.generateSelfSignedCertificates(this.getNetworkIP());

    // Update the HTTPS server with the new certificates.
    if (updateServer) {
      this.httpsServer.setSecureContext({
        key: privateKeyPem,
        cert: certPem,
      });
      this.serverLog(
        "New self-signed certificate generated and applied.",
        true
      );
    }

    return { certPem, privateKeyPem };
  }

  /**
   * Logs messages to the server console and optionally sends them to the client.
   * @param {*} logMessage
   * @param {boolean} sendToClient
   */
  serverLog(logMessage, sendToClient = false) {
    console.log(logMessage);
    // Logs to controller screen.
    if (sendToClient)
      this.io.emit("serverLog", JSON.stringify(logMessage).replace(/"/g, ""));
  }
}

export default WsSocketServer;
