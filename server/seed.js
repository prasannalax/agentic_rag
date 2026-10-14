
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Document from './models/Document.js';

dotenv.config({ path: new URL('./.env', import.meta.url) });

const OLLAMA_URL =
  process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

const EMBEDDING_MODEL =
  process.env.OLLAMA_EMBED_MODEL || 'nomic-embed-text';

const internalCompanyDocs = [
  {
    title: 'Home Office Stipend Policy',
    content:
      'Employees are eligible for a $1,200 annual home-office equipment allowance. Expenses must be submitted via the Concur portal before December 1st.'
  },
  {
    title: 'Software Tool Procurement Policy',
    content:
      'All developer tools and cloud SaaS subscriptions above $50/month require written approval from the Head of Infrastructure. Unapproved tools will not be reimbursed.'
  },
  {
    title: 'Parental Leave Guidelines',
    content:
      'The company offers 16 weeks of fully paid parental leave for primary caregivers and 8 weeks for secondary caregivers, eligible after 6 months of continuous employment.'
  }
];

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
      `Expected a 768-dimensional vector, received ${vector?.length ?? 0}.`
    );
  }

  return vector;
}

async function seed() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing from server/.env');
    }

    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB Atlas.');

    for (const doc of internalCompanyDocs) {
      const vector = await createEmbedding(doc.content);

      // Update the matching sample document, or insert it if it does not exist.
      // Other documents in the collection are preserved.
      await Document.updateOne(
        { title: doc.title },
        {
          $set: {
            content: doc.content,
            embedding: vector,
            source: 'internal_kb'
          }
        },
        { upsert: true }
      );

      console.log(
        `Indexed "${doc.title}" with ${vector.length} dimensions.`
      );
    }

    console.log('Seeding complete.');
  } catch (err) {
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
}

seed();
