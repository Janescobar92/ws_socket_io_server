import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keyPath = path.join(__dirname, "..", "certificates", "key.pem");
const certPath = path.join(__dirname, "..", "certificates", "cert.pem");
const publicPath = path.join(__dirname, "..", "public");

export const httpPort = 3001;
export const httpsPort = 3002;

export const sslOptions = {
  key: keyPath,
  cert: certPath,
  rejectUnauthorized: false,
};
export const staticContentPath = publicPath;
