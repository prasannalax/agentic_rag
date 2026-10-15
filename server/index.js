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

// Generate the final answer using Groq with history support.
async function generateAnswer(query, context, sourceOrigin, history = []) {
  const systemPrompt = `You are an intelligent, helpful AI assistant built on an Agentic RAG system.

Your System Stack:
- Chat Generation: Groq (${GROQ_CHAT_MODEL})
- Local Embeddings: Ollama (${OLLAMA_EMBED_MODEL})
- Database: MongoDB Atlas (Vector Search)
- Live Web Search: DuckDuckGo MCP Integration

Answering Guidelines:
1. For greetings, identity questions ("who are you?"), or general capabilities: Answer directly in a friendly, professional manner without relying strictly on external documents.
2. For questions with context provided (Internal KB or Web Search): Base your response on the supplied context and cite key facts accurately.
3. If no relevant context exists for a specialized fact question: Explain clearly that sufficient information was not found. Never invent current facts or citations.`;

  const completion = await groq.chat.completions.create({
    model: GROQ_CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
      ...history
        .filter(
          (message) =>
            ['user', 'assistant'].includes(message.role) &&
            typeof message.content === 'string'
        )
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 4000)
        })),
      {
        role: 'user',
        content:
          `Source Origin: ${sourceOrigin}\n\n` +
          `Context Information:\n${context || 'No specific context provided.'}\n\n` +
          `User Query:\n${query}`
      }
    ],
    temperature: 0.3,
    max_completion_tokens: 2048
  });

  const answer = completion.choices?.[0]?.message?.content;

  if (typeof answer !== 'string' || !answer.trim()) {
    throw new Error('Groq returned an empty answer.');
  }

  return answer.trim();
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    embeddings: 'Ollama',
    chat: 'Groq',
    model: GROQ_CHAT_MODEL
  });
});

app.post('/api/chat', async (req, res) => {
  const query =
    typeof req.body?.query === 'string' ? req.body.query.trim() : '';
  const history = Array.isArray(req.body?.history)
    ? req.body.history
        .filter(
          (message) =>
            ['user', 'assistant'].includes(message.role) &&
            typeof message.content === 'string'
        )
        .slice(-10)
        .map((message) => ({
          role: message.role,
          content: message.content.slice(0, 4000)
        }))
    : [];

  if (!query) {
    return res.status(400).json({ error: "Query is required" });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (data) => {
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  };

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
      sendEvent({ status: `Resolved from Internal Knowledge Base (Similarity: ${topScore.toFixed(2)})` });
      context = localMatches.map(m => `[Document: ${m.title}]: ${m.content}`).join('\n\n');
      sourceOrigin = 'internal_kb';
    } else {
      console.log("-> Routing: DuckDuckGo Fallback via MCP");
      sendEvent({ status: "Local data insufficient. Falling back to live DuckDuckGo via MCP..." });
      sourceOrigin = 'duckduckgo_live';
      context = await queryDuckDuckGoFallback(query);
      console.log("DuckDuckGo context acquired successfully.");
    }

    // 4. Generate final answer using Groq with history passed in
    const answer = await generateAnswer(query, context, sourceOrigin, history);

    sendEvent({
      text: answer,
      source: sourceOrigin
    });

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    console.error("Pipeline error:", error);
    sendEvent({ error: error.message });
    if (!res.writableEnded) {
      res.end();
    }
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});