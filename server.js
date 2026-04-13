#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import { judgeOneSubmission } from './judge-one-submission.js';

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.JUDGE_API_KEY || '';

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/judge-submission', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const providedKey = bearer || req.headers['x-api-key'] || '';

    if (!API_KEY || providedKey !== API_KEY) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { submissionId } = req.body || {};

    if (!submissionId || typeof submissionId !== 'string') {
      return res.status(400).json({ error: 'submissionId is required' });
    }

    const result = await judgeOneSubmission(submissionId);

    return res.json({
      ok: true,
      submissionId,
      result
    });
  } catch (err) {
    console.error('judge-submission failed:', err);
    return res.status(500).json({
      ok: false,
      error: err.message || 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Presser backend listening on port ${PORT}`);
});