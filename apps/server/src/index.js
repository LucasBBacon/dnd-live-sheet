import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import characterRoutes from "./routes/character.js";
import referenceRoutes from "./routes/reference.js";
import { createAuthMiddleware } from "./middleware/requireAuth.js";
import { MockAuthProvider } from "./core/auth/MockAuthProvider.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { Server } from "socket.io";
import { initializeWebSockets } from "./socket/controller.js";
const app = express();
const server = http.createServer(app); // wrap express in standard http server
const io = new Server(server, {
    cors: {
        origin: process.env.CLIENT_URL || "http://localhost:5173",
        methods: ["GET", "POST"],
    },
});
// security and parsing middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());
// mock auth
const authMiddleware = createAuthMiddleware(new MockAuthProvider());
// route registration
app.use("/api/character", authMiddleware, characterRoutes);
app.use("/api/reference", referenceRoutes);
// global error catcher (REGISTER LAST)
app.use(globalErrorHandler);
initializeWebSockets(io);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server & WebSockets initialized on port ${PORT}`);
});
//# sourceMappingURL=index.js.map