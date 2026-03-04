import { io, Socket } from "socket.io-client";

const SOCKET_URL = "http://localhost:8000";

export const socket: Socket = io(SOCKET_URL, {
  transports: ["websocket"],   // pas de polling (plus stable)
  autoConnect: false,          // connexion manuelle
  reconnection: true,          // autorise reconnexion
  reconnectionAttempts: 5,     // évite boucle infinie
  reconnectionDelay: 1000,
  timeout: 5000,               // ⛔ évite freeze si backend down
});
