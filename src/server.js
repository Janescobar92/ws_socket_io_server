import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import cors from "cors";
import { createServer } from "node:https";
import { Server } from "socket.io";

import EVENTS from "./constants/events.js";
import ROOMS from "./constants/rooms.js";
import { SS_CONNECTED, SS_DISCONNECTED } from "./constants/message.js";

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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const keyPath = path.join(__dirname, "..", "certificates", "key.pem");
const certPath = path.join(__dirname, "..", "certificates", "cert.pem");

const publicPath = path.join(__dirname, "..", "public");

const options = {
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath),
  rejectUnauthorized: false,
};

class WsSocketServer {
  constructor() {
    this.port = 8080;
    this.app = express();
    this.server = createServer(
      options,
      this.app.use(cors(), express.static(publicPath))
    );
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
      },
      // rejectUnauthorized: false,
    });
    this.folderPath = "./config";
    this.initFileName = "init.json";
    this.fullInitPath = path.join(this.folderPath, this.initFileName);
    this.connectedClients = [];
    // this.whiteList = ["http://localhost:3000"];
  }

  /**
   * Reads init file from init.json and sets the init port.
   */
  readInitFile() {
    try {
      const fileData = fs.readFileSync(this.fullInitPath, "utf-8");
      const parsedData = JSON.parse(fileData);
      if (!parsedData?.port) {
        this.writeInitFile();
      } else {
        this.port = parsedData?.port;
      }
    } catch (error) {
      this.writeInitFile();
      console.log({ error });
    }
  }

  /**
   * Writes init file.
   */
  writeInitFile() {
    try {
      fs.mkdirSync(this.folderPath, { recursive: true });
      fs.writeFileSync(
        this.fullInitPath,
        JSON.stringify({ port: this.port }, null, 2)
      );
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Starts server
   */
  start() {
    this.io.on(CONNECTION, (socket) => {
      this.clientConnected();
      const events = Object.values(EVENTS);
      events.forEach((event) => {
        socket.on(event, (data) => this.customSocketEvent(event, socket, data));
      });
    });

    this.readInitFile();
    this.server.listen(this.port, (a) => {
      console.log(`Listening on ${this.port}`);
      this.checkConnectedClients();
    });
    this.enableEndpoints();
  }

  /**
   * Shut down server.
   */
  async shutdown(socket, restart = false) {
    console.log("Shutting down server...");
    this.server.close(() => {
      console.log("WsSocketServer successfully shut down");
      if (restart) {
        this.start();
      } else {
        process.exit(0);
      }
    });
    await socket.disconnect();
  }

  async restartServer(socket) {
    await this.shutdown(socket, true);
  }

  clientConnected() {
    console.log("A client has connected");
  }

  clientDisconnected(socket) {
    console.log("A client has been disconnected");
    this.connectedClients = this.connectedClients.filter(
      (s) => s.socket_id !== socket.id
    );
  }

  register(socket, room) {
    socket.join(room);
    console.log(`Client registered in room ${room}`);
    this.connectedClients.push({ socket_id: socket.id, room });
  }

  emitRoomEvent(socket, data) {
    const payload = JSON.parse(data);
    const { room, roomEvent } = payload;
    console.log({ room, roomEvent, data });
    socket.to(room).emit(roomEvent, data);
  }

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

  areThereClientsInRoom(room) {
    return this.connectedClients.some((client) => client.room === room);
  }

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

  checkConnectedClients() {
    setInterval(() => {
      console.log({
        connectedClients: this.connectedClients,
      });
      this.healthCheck();
    }, 10000);
  }

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

  landig() {
    this.app.get("/", (req, res) => {
      const indexPath = path.join(__dirname, publicPath, "index.html");
      const content = fs.readFileSync(indexPath, "utf8");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(content);
    });
  }

  enableEndpoints() {
    this.landig();
    this.statusEndpoint();
  }

  // allowCorsOrigins() {
  // }
}

export default WsSocketServer;
