import "dotenv/config";
import "reflect-metadata";
import express from "express";
import morgan from "morgan";
import { DaemoClient, DaemoHostedConnection } from "daemo-engine";
import {
  initializeDaemo,
  startConnection,
  stopConnection,
} from "./services/daemoService";

const app = express();
const PORT = process.env.PORT || 3000;
let daemoConnection: DaemoHostedConnection | null = null;
let daemoClient: DaemoClient | null = null;

app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ Hello: "World" });
});

const server = app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}\n`);

  const systemPrompt = `
  You are a news briefer. Your job is to summarize relevant news based on a user's query.
  IMPORTANT:
    - Your responses must be relevant to the user's query. Do not include any irrelevant information.
    - If a user's query is too vague, ask follow-up questions for more specific information.
    - Format your responses in a concise, engaging, and readable manner.
  `.trim();
  const sessionData = initializeDaemo(systemPrompt);
  daemoConnection = await startConnection(sessionData);
  daemoClient = new DaemoClient({
    daemoAgentUrl: process.env.DAEMO_GATEWAY_URL,
    agentApiKey: process.env.DAEMO_AGENT_API_KEY,
  });
});

const gracefulShutdown = (signal: string) => {
  console.log(`\nReceived ${signal}. Shutting down gracefully...\n`);
  server.close(() => {
    if (daemoConnection) stopConnection(daemoConnection);
    process.exit(0);
  });
};

process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);
