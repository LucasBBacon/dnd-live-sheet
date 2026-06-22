import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createAuthMiddleware } from "./middleware/requireAuth.js";
import { MockAuthProvider } from "./core/auth/MockAuthProvider.js";
import characterRoutes from "./routes/character.js";
import { globalErrorHandler } from "./middleware/errorHandler.js";

const app = express();

// security and parsing middleware
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173" }));
app.use(express.json());

// mock auth
const authMiddleware = createAuthMiddleware(new MockAuthProvider());

// route registration
app.use("/api/character", authMiddleware, characterRoutes);

// global error catcher (REGISTER LAST)
app.use(globalErrorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server initialized on port ${PORT}`);
});
