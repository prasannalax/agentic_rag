import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fixes MongoDB SRV resolution on Windows

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Groq from 'groq-sdk';
import Document from './models/Document.js';
import { queryDuckDuckGoFallback } from './services/mcpClient.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';
const GROQ_CHAT_MODEL = process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

await mongoose.connect(process.env.MONGODB_URI);
console.log("Connected to MongoDB Atlas.");
console.log(`Chat model: ${GROQ_CHAT_MODEL}`);
console.log(`Embedding model: ${OLLAMA_EMBED_MODEL}`);

// Helper to embed query locally using Ollama
async function getOllamaEmbedding(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_EMBED_MODEL,
      prompt: text
    })
  });

  if (!res.ok) {
    throw new Error(`Ollama embedding error: ${res.statusText}`);
  }

  const data = await res.json();
  return data.embedding;
}

app.post('/api/chat', async (req, res) => {
  const { query } = req.body;

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    // 1. Generate vector representation
    const queryVector = await getOllamaEmbedding(query);

    // 2. Query MongoDB Vector Index
    const localMatches = await Document.aggregate([
      {
        $vectorSearch: { index: 'vector_index', path: 'embedding', queryVector: queryVector, numCandidates: 10, limit: 2 } }, {$project: {
          title: 1,
          content: 1,
          score: { $meta: 'vectorSearchScore' }
        }
      }
    ]);

    let context = '';
    let sourceOrigin = 'internal_kb';
    const topScore = localMatches[0]?.score || 0;
    
    // Threshold set to 0.78 for nomic-embed-text cosine distances
    const SUFFICIENCY_THRESHOLD = 0.78;
    console.log(`Query: "${query}" | Top Vector Score: ${topScore} (Threshold: ${SUFFICIENCY_THRESHOLD})`);

    // 3. Routing decision
    if (topScore >= SUFFICIENCY_THRESHOLD) {
      console.log("-> Routing: Internal Knowledge Base");
      res.write(`data: ${JSON.stringify({ status: `Resolved from Internal Knowledge Base (Similarity: ${topScore.toFixed(2)})` })}\n\n`);
      context = localMatches.map(m => `[Document: ${m.title}]: ${m.content}`).join('\n\n');
      sourceOrigin = 'internal_kb';
    } else {
      console.log("-> Routing: DuckDuckGo Fallback via MCP");
      res.write(`data: ${JSON.stringify({ status: "Local data insufficient. Falling back to live DuckDuckGo via MCP..." })}\n\n`);
      sourceOrigin = 'duckduckgo_live';
      context = await queryDuckDuckGoFallback(query);
      console.log("DuckDuckGo context acquired successfully.");
    }

    // 4. Groq chat completion with tool-call suppression
    const stream = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are an intelligent enterprise assistant.
Do not output raw JSON, function executions, or tool calls.
Answer the user's question clearly in conversational markdown using ONLY the context provided below.

Source origin: ${sourceOrigin}

Context:
${context}`
        },
        {
          role: 'user',
          content: query
        }
      ],
      model: GROQ_CHAT_MODEL,
      tool_choice: 'none',
      stream: true
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text, source: sourceOrigin })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error("Pipeline error:", error);
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});