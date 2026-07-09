import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import characterRoutes from "./routes/character.js";
import referenceRoutes from "./routes/reference.js";
import homebrewRoutes from "./routes/homebrew.js";
import { createAuthMiddleware } from "./middleware/requireAuth.js";
import { MockAuthProvider } from "./core/auth/MockAuthProvider.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";
import { initializeWebSocketGateway } from "./gateway/socket.js";

const app = express();
const server = http.createServer(app); // wrap express in standard http server

// security and parsing middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// mock auth
const authMiddleware = createAuthMiddleware(new MockAuthProvider());

// route registration
app.use("/api/character", authMiddleware, characterRoutes);
app.use("/api/reference", referenceRoutes);
app.use("/api/homebrew", authMiddleware, homebrewRoutes);

// global error catcher (REGISTER LAST)
app.use(globalErrorHandler);

initializeWebSocketGateway(server);

const PORT = process.env.PORT || 3000;

const bootstrap = async () => {
  if (process.env.DATABASE_URL) {
    const { warmReferenceCache } = await import("./services/referenceCache.js");
    await warmReferenceCache();
  }
  server.listen(PORT, () => {
    console.log(`Server & WebSockets initialized on port ${PORT}`);
  });
};

bootstrap().catch((error) => {
  console.error("Failed to bootstrap server:", error);
  process.exit(1);
});
