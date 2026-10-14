import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']); // Fixes querySrv ECONNREFUSED

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Document from './models/Document.js';
import { queryDuckDuckGoFallback } from './services/mcpClient.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Working embedding model
const embeddingModel = genAI.getGenerativeModel(
  { model: "gemini-embedding-001" },
  { apiVersion: "v1beta" }
);

// The exact model your account requires
const chatModel = genAI.getGenerativeModel({ model: "gemini-3.8-flash" });

await mongoose.connect(process.env.MONGODB_URI);
console.log("Connected to MongoDB Atlas.");

// Generate content safely with retry against intermittent 503 spikes
async function safeGenerateContent(prompt, maxRetries = 3) {
  let delay = 1000;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Standard generateContent is far more stable than streaming during high load
      const response = await chatModel.generateContent(prompt);
      return response.response.text();
    } catch (err) {
      const isCapacityIssue = err.status === 503 || err.message?.includes('503') || err.message?.includes('high demand');
      if (isCapacityIssue && attempt < maxRetries) {
        console.log(`Gemini capacity busy (503). Retrying in ${delay / 1000}s (Attempt ${attempt}/${maxRetries})...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      } else {
        throw err;
      }
    }
  }
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
    // 1. Vectorize query with fixed 768 dimensions
    const embResult = await embeddingModel.embedContent({
      content: { parts: [{ text: query }] },
      outputDimensionality: 768
    });
    const queryVector = embResult.embedding.values.slice(0, 768);

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
    console.log(`Query: "${query}" | Top Vector Score: ${topScore}`);

    const SUFFICIENCY_THRESHOLD = 0.75;

    // 3. Fallback Evaluation
    if (topScore >= SUFFICIENCY_THRESHOLD) {
      res.write(`data: ${JSON.stringify({ status: `Resolved from Internal Knowledge Base (Similarity: ${topScore.toFixed(2)})` })}\n\n`);
      context = localMatches.map(m => `[Document: ${m.title}]: ${m.content}`).join('\n\n');
    } else {
      res.write(`data: ${JSON.stringify({ status: "Local data insufficient. Falling back to live DuckDuckGo via MCP..." })}\n\n`);
      console.log(`Triggering DuckDuckGo MCP fallback for: "${query}"`);
      context = await queryDuckDuckGoFallback(query);
      console.log("DuckDuckGo results fetched successfully.");
      sourceOrigin = 'duckduckgo_live';
    }

    // 4. Synthesize final answer
    const prompt = `You are an intelligent enterprise assistant.
Answer the user query clearly and directly using the context provided below.
Source: ${sourceOrigin}

Context:
${context}

User Query:
${query}`;

    const text = await safeGenerateContent(prompt);

    // Send the generated text chunk over the SSE channel
    res.write(`data: ${JSON.stringify({ text, source: sourceOrigin })}\n\n`);
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