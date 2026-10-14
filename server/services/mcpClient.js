import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpClient = null;

export async function getMCPClient() {
  if (mcpClient) return mcpClient;

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

  console.log("DuckDuckGo MCP connected.");
  return mcpClient;
}

export async function queryDuckDuckGoFallback(query) {
  try {
    const client = await getMCPClient();

    // Make time-sensitive news searches more explicit.
    const isCurrentNews =
      /\b(latest|current|today|breaking|recent)\b/i.test(query) &&
      /\b(news|world|india|headlines|updates)\b/i.test(query);

    const searchQuery = isCurrentNews
      ? `${query} latest news headlines`
      : query;

    console.log(`MCP search query: "${searchQuery}"`);

    const response = await client.callTool({
      name: "search",
      arguments: {
        query: searchQuery,
        maxResults: 5
      }
    });

    if (response.isError) {
      const errorText = (response.content || [])
        .map(item => item.text || "")
        .join("\n");

      throw new Error(errorText || "DuckDuckGo search tool returned an error.");
    }

    const results = (response.content || [])
      .filter(item => item.type === "text" && item.text?.trim())
      .map(item => item.text.trim());

    if (results.length === 0) {
      console.log("DuckDuckGo returned no text results.");
      return "No usable external search results were returned. Tell the user that live search did not provide enough information; do not invent current facts.";
    }

    const formattedResults = results
      .map((result, index) => `Search result ${index + 1}:\n${result}`)
      .join("\n\n");

    console.log(`DuckDuckGo returned ${results.length} result item(s).`);
    console.log("Search result preview:", formattedResults.slice(0, 500));

    return formattedResults;
  } catch (err) {
    console.error("DuckDuckGo MCP failed:", err.message);
    throw new Error(`Live web search failed: ${err.message}`);
  }
}