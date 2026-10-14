import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpClient = null;

export async function getMCPClient() {
  if (mcpClient) return mcpClient;

  // On Windows, npx requires shell: true
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["-y", "duckduckgo-websearch"],
    options: {
      shell: true
    }
  });

  const client = new Client(
    { name: "mern-ddg-rag-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  mcpClient = client;
  return mcpClient;
}

export async function queryDuckDuckGoFallback(query) {
  try {
    const client = await getMCPClient();

    const response = await client.callTool({
      name: "search",
      arguments: {
        query: query,
        maxResults: 3
      }
    });

    if (!response.content || response.content.length === 0) {
      return "No external web results found.";
    }

    return response.content.map(item => item.text).join("\n\n");
  } catch (err) {
    console.error("DuckDuckGo MCP failed:", err);
    return `Fallback search encountered an error: ${err.message}`;
  }
}