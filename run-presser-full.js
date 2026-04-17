#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import OpenAI from 'openai';
import { getQuestionByKey } from './question-bank.js';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || '';
const ELEVENLABS_VOICE_CATY = process.env.ELEVENLABS_VOICE_CATY || '';
const ELEVENLABS_VOICE_DEN = process.env.ELEVENLABS_VOICE_DEN || '';
const ELEVENLABS_VOICE_TESS = process.env.ELEVENLABS_VOICE_TESS || '';

if (!OPENAI_API_KEY) {
  console.error('Missing OPENAI_API_KEY in environment.');
  process.exit(1);
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, 'assets');
const OUTPUT = path.join(ROOT, 'output');
fs.mkdirSync(OUTPUT, { recursive: true });

const INPUT_VIDEO = process.argv[2] || path.join(ROOT, 'input.mp4');
const QUESTION_KEY = process.argv[3] || 'fuel_prices';
const ACTIVE_QUESTION = getQuestionByKey(QUESTION_KEY);

const CONTESTANT = {
  name: 'Contestant',
  topic: ACTIVE_QUESTION.topic
};

const JUDGES = [
  {
    id: 'caty',
    displayName: 'Caty',
    portrait: path.join(ASSETS, 'Caty.jpeg'),
    voiceId: ELEVENLABS_VOICE_CATY,
    color: '0xf6d54a',
    style: 'blunt, sharp, balanced, cuts through waffle fast',
    hiddenVoteMax: 3,
    allowedVotes: [0, 1, 2, 3],
    discretionGuide:
      'You are balanced but blunt. Hidden discretion options are only 0, 1, 2, or 3. Give 0 for weak or messy answers. Give 1 for basic or limited answers. Give 2 for clearly good answers. Give 3 for punchy, polished, memorable, persuasive answers.'
  },
  {
    id: 'den',
    displayName: 'Den',
    portrait: path.join(ASSETS, 'Den.jpeg'),
    voiceId: ELEVENLABS_VOICE_DEN,
    color: '0xff3366',
    style: 'cold, nasty, demanding, theatrical, hard to impress',
    hiddenVoteMax: 1.5,
    allowedVotes: [0, 0.5, 1.0, 1.5],
    discretionGuide:
      'You are the harshest judge. Hidden discretion options are only 0, 0.5, 1.0, or 1.5. Give 0 if there is basically nothing to admire. Give 0.5 for a little competence. Give 1.0 for a decent answer with some quality. Give 1.5 only if it is genuinely strong. You should usually score lower than the others.'
  },
  {
    id: 'tess',
    displayName: 'Tess',
    portrait: path.join(ASSETS, 'Tess.jpeg'),
    voiceId: ELEVENLABS_VOICE_TESS,
    color: '0x66aaff',
    style: 'warm, generous, encouraging, always looking for something good',
    hiddenVoteMax: 4,
    allowedVotes: [0, 1, 2, 3, 4],
    discretionGuide:
      'You are the nicest judge. Hidden discretion options are only 0, 1, 2, 3, or 4. You actively look for something good in the answer if anything is there. If there is genuinely nothing good, score low. But if there is clarity, effort, personality, confidence, warmth, or any memorable line, reward it. Give 4 for genuinely compelling delivery.'
  }
];

const SHARED_WORD_MAX = 7;
const DISPLAYED_JUDGE_MAX = 11;
const BACKGROUND_IMAGE = path.join(ASSETS, 'thepresserchair.jpeg');

function checkFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
  if (res.status !== 0) {
    throw new Error(`${cmd} failed with exit code ${res.status}`);
  }
}

function runCapture(cmd, args) {
  const res = spawnSync(cmd, args, { encoding: 'utf8', shell: false });
  if (res.status !== 0) {
    throw new Error((res.stderr || res.stdout || `${cmd} failed`).trim());
  }
  return (res.stdout || '').trim();
}

async function transcribeVideoToText(videoPath) {
  const stream = fs.createReadStream(videoPath);
  const transcript = await client.audio.transcriptions.create({
    file: stream,
    model: 'gpt-4o-transcribe'
  });
  return transcript.text;
}

function secondsOfMedia(filePath) {
  const out = runCapture('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ]);
  return Number(out);
}

function escapeDrawtext(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'")
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, ' ');
}

function alphaExpr(start, fadeIn, end, fadeOut) {
  const s = start.toFixed(2);
  const fi = (start + fadeIn).toFixed(2);
  const fo = (end - fadeOut).toFixed(2);
  const e = end.toFixed(2);
  return `if(lt(t\\,${s})\\,0\\,if(lt(t\\,${fi})\\,(t-${s})/${fadeIn.toFixed(2)}\\,if(lt(t\\,${fo})\\,1\\,if(lt(t\\,${e})\\,(${e}-t)/${fadeOut.toFixed(2)}\\,0))))`;
}

function normalizeText(text) {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWholeWord(normalizedText, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedPhrase)}(?=\\s|$)`, 'i');
  return pattern.test(normalizedText);
}

function hasAnyPhrase(normalizedText, variants = []) {
  return variants.some(variant => hasWholeWord(normalizedText, variant));
}

function buildKeywordSpec(questionKey) {
  if (questionKey === 'fuel_prices') {
    return {
      standard: [
        { label: 'supply', variants: ['supply'] },
        { label: 'demand', variants: ['demand'] },
        { label: 'oil prices', variants: ['oil prices', 'oil price', 'crude oil prices', 'crude oil price'] },
        { label: 'Australia', variants: ['australia', 'australian'] },
        { label: 'imports', variants: ['imports', 'imported', 'import'] },
        { label: 'bowser', variants: ['bowser', 'petrol bowser'] },
        { label: 'servo', variants: ['servo', 'servos', 'service station', 'petrol station'] },
        { label: 'taxes', variants: ['tax', 'taxes', 'fuel tax', 'excise'] },
        { label: 'currency', variants: ['currency'] },
        { label: 'dollar', variants: ['dollar', 'australian dollar', 'weak dollar'] },
        { label: 'transport', variants: ['transport', 'shipping', 'freight'] },
        { label: 'distribution', variants: ['distribution', 'distributing'] }
      ],
      advanced: [
        { label: 'inelastic', variants: ['inelastic', 'inelasticity'] },
        { label: 'geopolitics', variants: ['geopolitics', 'geopolitical', 'war', 'middle east conflict'] },
        { label: 'refining capacity', variants: ['refining capacity', 'refinery capacity', 'refineries', 'refining'] },
        { label: 'margins', variants: ['margins', 'profit margins', 'retail margins', 'refining margins'] },
        { label: 'global vs local markets', variants: ['global market', 'global markets', 'local market', 'local markets'] },
        { label: 'exchange rate impact', variants: ['exchange rate', 'weak australian dollar', 'currency impact', 'dollar impact'] },
        { label: 'economics', variants: ['economics', 'economic'] }
      ]
    };
  }

  if (questionKey === 'immutable') {
    return {
      standard: [
        { label: 'cannot change', variants: ['cannot change', 'can not change', 'cannot be changed', 'unchangeable'] },
        { label: 'fixed', variants: ['fixed'] },
        { label: 'constant', variants: ['constant'] },
        { label: 'unchanging', variants: ['unchanging'] },
        { label: 'permanent', variants: ['permanent'] },
        { label: 'rule', variants: ['rule', 'rules'] },
        { label: 'law', variants: ['law', 'laws'] },
        { label: 'time', variants: ['time'] }
      ],
      advanced: [
        { label: 'absolute', variants: ['absolute', 'absolutely fixed'] },
        { label: 'fundamentally', variants: ['fundamentally'] },
        { label: 'inherent nature', variants: ['inherent nature', 'by nature'] },
        { label: 'logical necessity', variants: ['logical necessity', 'logically necessary'] },
        { label: 'system design', variants: ['system design', 'software design', 'programming'] },
        { label: 'data integrity', variants: ['data integrity'] }
      ]
    };
  }

  if (questionKey === 'scrambled_eggs') {
    return {
      standard: [
        { label: 'low heat', variants: ['low heat', 'gentle heat', 'cook slowly', 'slow heat'] },
        { label: 'butter', variants: ['butter'] },
        { label: 'stirring', variants: ['stir', 'stirring',