import mongoose from 'mongoose';

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  embedding: { type: [Number], required: true },
  source: { type: String, default: 'internal_kb' }
});

export default mongoose.model('Document', DocumentSchema);