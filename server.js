#!/usr/bin/env node
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { judgeOneSubmission } from './judge-one-submission.js';

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigin = 'https://thepresserfrontend.onrender.com';

app.use(cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.options('*', cors({
  origin: allowedOrigin,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));

app.use(express.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/judge-submission', async (req, res) => {
  try {
    const { attemptId } = req.body || {};

    if (!attemptId || typeof attemptId !== 'string') {
      return res.status(400).json({ error: 'attemptId is required' });
    }

    const result = await judgeOneSubmission(attemptId);

    return res.json({
      ok: true,
      attemptId,
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