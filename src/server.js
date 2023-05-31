import * as fs from "fs";
import path from "path";
import express from "express";

import { createServer } from "http";
import { Server } from "socket.io";
import EVENTS from "./constants/events.js";

const { CONNECTION, DISCONNECT, RESTART_SERVER, SHUT_DOWN } = EVENTS;

class WsSocketServer {
  constructor() {
    this.port = 8080;
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server);
    this.folderPath = "./config";
    this.initFileName = "init.json";
    this.fullInitPath = path.join(this.folderPath, this.initFileName);
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
      console.log({ events });
      events.forEach((event) => {
        socket.on(event, () => this.customSocketEvent(event, socket));
      });
    });

    this.readInitFile();
    this.server.listen(this.port, () => {
      console.log(`Listening on ${this.port}`);
    });
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

  clientDisconnected() {
    console.log("A client has been disconnected");
  }

  customSocketEvent(eventType, socket) {
    console.log({ eventType });
    switch (eventType) {
      case CONNECTION:
        return this.clientConnected();
      case DISCONNECT:
        return this.clientDisconnected();
      case SHUT_DOWN:
        return this.shutdown(socket);
      case RESTART_SERVER:
        return this.restartServer(socket);
      default:
        break;
    }
  }
}

export default WsSocketServer;
