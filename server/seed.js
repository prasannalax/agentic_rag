import dns from 'node:dns';
// Resolve DNS SRV queries using Google DNS to avoid ECONNREFUSED
dns.setServers(['8.8.8.8', '8.8.4.4']);

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Document from './models/Document.js';

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Active Gemini embedding model on the v1beta endpoint
const embeddingModel = genAI.getGenerativeModel(
  { model: "gemini-embedding-001" },
  { apiVersion: "v1beta" }
);

const internalCompanyDocs = [
  {
    title: "Home Office Stipend Policy",
    content: "Employees are eligible for a $1,200 annual home-office equipment allowance. Expenses must be submitted via the Concur portal before December 1st."
  },
  {
    title: "Software Tool Procurement Policy",
    content: "All developer tools and cloud SaaS subscriptions above $50/month require written approval from the Head of Infrastructure. Unapproved tools will not be reimbursed."
  },
  {
    title: "Parental Leave Guidelines",
    content: "The company offers 16 weeks of fully paid parental leave for primary caregivers and 8 weeks for secondary caregivers, eligible after 6 months of continuous employment."
  }
];

async function seed() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB Atlas.");

    // Remove older vectors to ensure clean schema and matching dimensions
    await Document.deleteMany({});
    console.log("Cleared old documents.");

    for (const doc of internalCompanyDocs) {
      // Generate 768-dimensional embedding vector matching the Atlas index
      const result = await embeddingModel.embedContent({
        content: { parts: [{ text: doc.content }] },
        outputDimensionality: 768
      });

      const vector = result.embedding.values.slice(0, 768);

      await Document.create({
        title: doc.title,
        content: doc.content,
        embedding: vector
      });

      console.log(`Indexed: "${doc.title}" (Vector length: ${vector.length})`);
    }

    console.log("Seeding complete!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

seed();