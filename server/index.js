import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Groq from 'groq-sdk';
import Document from './models/Document.js';
import { queryDuckDuckGoFallback } from './services/mcpClient.js';

// Always load .env from the server directory.
dotenv.config({ path: new URL('./.env', import.meta.url) });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;

const OLLAMA_URL =
  process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const EMBEDDING_MODEL =
  process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

const CHAT_MODEL =
  process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-20b';

if (!process.env.MONGODB_URI) {
  throw new Error('MONGODB_URI is missing from server/.env');
}

if (!process.env.GROQ_API_KEY) {
  throw new Error('GROQ_API_KEY is missing from server/.env');
}

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// Helper to identify conversational or identity questions
function isGeneralOrIdentityQuery(query) {
  const q = query.toLowerCase().trim();
  const pattern = /\b(hi|hello|hey|who are you|what can you do|your name|what is this|help|how are you)\b/i;
  return pattern.test(q) && q.length < 50;
}

// Generate a local embedding using Ollama.
async function createEmbedding(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text
    })
  });

  if (!response.ok) {
    throw new Error(
      `Ollama embedding failed (${response.status}): ${await response.text()}`
    );
  }

  const data = await response.json();
  const vector = data.embeddings?.[0];

  if (!vector || vector.length !== 768) {
    throw new Error(
      `Expected a 768-dimensional embedding; received ${vector?.length ?? 0}.`
    );
  }

  return vector;
}

// Generate the final answer using Groq.
async function generateAnswer(query, context, sourceOrigin) {
  const systemPrompt = `You are an intelligent, helpful AI assistant built on an Agentic RAG system.

Your System Stack:
- Chat Generation: Groq (${CHAT_MODEL})
- Local Embeddings: Ollama (${EMBEDDING_MODEL})
- Database: MongoDB Atlas (Vector Search)
- Live Web Search: DuckDuckGo MCP Integration

Answering Guidelines:
1. For greetings, identity questions ("who are you?"), or general capabilities: Answer directly in a friendly, professional manner without relying strictly on external documents.
2. For questions with context provided (Internal KB or Web Search): Base your response on the supplied context and cite key facts accurately.
3. If no relevant context exists for a specialized fact question: Explain clearly that sufficient information was not found. Never invent current facts or citations.`;

  const completion = await groq.chat.completions.create({
    model: CHAT_MODEL,
    messages: [
      {
        role: 'system',
        content: systemPrompt
      },
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

// Connect to MongoDB before accepting requests.
await mongoose.connect(process.env.MONGODB_URI);
console.log('Connected to MongoDB Atlas.');

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    embeddings: 'Ollama',
    chat: 'Groq',
    model: CHAT_MODEL
  });
});

app.post('/api/chat', async (req, res) => {
  const query =
    typeof req.body?.query === 'string' ? req.body.query.trim() : '';

  if (!query) {
    return res.status(400).json({ error: 'Query is required.' });
  }

  // Preserve the existing frontend's Server-Sent Events format.
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
    let context = '';
    let sourceOrigin = 'general_assistant';

    // Check for direct identity or greeting questions first
    if (isGeneralOrIdentityQuery(query)) {
      sendEvent({ status: 'Processing query...' });
      sourceOrigin = 'general_assistant';
    } else {
      // 1. Embed the question locally using Ollama
      sendEvent({ status: 'Searching local vector database...' });
      const queryVector = await createEmbedding(query);

      // 2. Search MongoDB Atlas vector index
      const localMatches = await Document.aggregate([
        {
          $vectorSearch: { index: 'vector_index', path: 'embedding', queryVector, numCandidates: 20, limit: 3 } }, {$project: {
            title: 1,
            content: 1,
            score: { $meta: 'vectorSearchScore' }
          }
        }
      ]);

      const topScore = localMatches[0]?.score ?? 0;
      console.log(`Query: "${query}" | Top vector score: ${topScore}`);

      // Cosine similarity threshold for vector search matching
      const SUFFICIENCY_THRESHOLD = 0.65;

      if (localMatches.length > 0 && topScore >= SUFFICIENCY_THRESHOLD) {
        context = localMatches
          .map((doc) => `[Document: ${doc.title}]\n${doc.content}`)
          .join('\n\n');

        sourceOrigin = 'internal_kb';
        sendEvent({
          status: `Resolved from Internal KB (Similarity: ${(topScore * 100).toFixed(1)}%)`
        });
      } else {
        // Fall back to live web search via DuckDuckGo MCP
        sendEvent({
          status: 'Local data insufficient. Searching live web via DuckDuckGo MCP...'
        });

        console.log(`Triggering DuckDuckGo MCP fallback for: "${query}"`);
        context = await queryDuckDuckGoFallback(query);
        sourceOrigin = 'duckduckgo_live';
        console.log('DuckDuckGo MCP fallback completed.');
      }
    }

    // Generate final answer using Groq
    const answer = await generateAnswer(query, context, sourceOrigin);

    sendEvent({
      text: answer,
      source: sourceOrigin
    });

    if (!res.writableEnded) {
      res.write('data: [DONE]\n\n');
      res.end();
    }
  } catch (error) {
    console.error('Pipeline error:', error.message);

    sendEvent({
      error: 'The request could not be completed. Check the backend terminal for details.'
    });

    if (!res.writableEnded) {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
  console.log(`Chat model: ${CHAT_MODEL}`);
  console.log(`Embedding model: ${EMBEDDING_MODEL}`);
});