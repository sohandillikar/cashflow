import { DaemoBuilder, DaemoHostedConnection, SessionData } from "daemo-engine";
import { StripeService } from "./stripeService";

export function initializeDaemo(systemPrompt: string) {
  const sessionData = new DaemoBuilder()
    .withServiceName("stripe_service")
    .withSystemPrompt(systemPrompt)
    .registerService(new StripeService())
    .build();
  sessionData.Port = 50052;
  console.log("\nSession data initialized!\n");
  return sessionData;
}

export async function startConnection(sessionData: SessionData) {
  const hostedConnection = new DaemoHostedConnection(
    {
      daemoGatewayUrl: process.env.DAEMO_GATEWAY_URL,
      agentApiKey: process.env.DAEMO_AGENT_API_KEY,
    },
    sessionData,
  );
  await hostedConnection.start();
  console.log("\nConnection started!\n");
  return hostedConnection;
}

export function stopConnection(hostedConnection: DaemoHostedConnection) {
  hostedConnection.stop();
  console.log("\nConnection stopped...\n");
}
