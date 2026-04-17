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
    '-of', 'default:noprint_wrappers=1:nokey=1',
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

/* ---------- DETERMINISTIC KEYWORD HELPERS ---------- */

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

// whole-word / whole-phrase match in normalized text
function hasWholeWord(normalizedText, phrase) {
  const normalizedPhrase = normalizeText(phrase);
  if (!normalizedPhrase) return false;
  const pattern = new RegExp(`(^|\\s)${escapeRegex(normalizedPhrase)}(?=\\s|$)`, 'i');
  return pattern.test(normalizedText);
}

function hasAnyPhrase(normalizedText, variants = []) {
  return variants.some(variant => hasWholeWord(normalizedText, variant));
}

// Deterministic keyword spec per question
function buildKeywordSpec(questionKey) {
  if (questionKey === 'fuel_prices') {
    return {
      standard: [
        { label: 'supply', variants: ['supply'] },
        { label: 'demand', variants: ['demand'] },
        { label: 'oil prices', variants: ['oil price', 'oil prices', 'crude oil price', 'crude oil prices'] },
        { label: 'Australia', variants: ['australia', 'australian'] },
        { label: 'imports', variants: ['import', 'imports', 'imported'] },
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
        { label: 'stirring', variants: ['stir', 'stirring'] },
        { label: 'folding', variants: ['fold', 'folding'] },
        { label: 'timing', variants: ['timing'] },
        { label: 'soft', variants: ['soft'] },
        { label: 'creamy', variants: ['creamy', 'creaminess'] },
        { label: 'remove early', variants: ['take them off early', 'remove early', 'off the heat early'] },
        { label: 'pan', variants: ['pan', 'non-stick pan'] }
      ],
      advanced: [
        { label: 'protein', variants: ['protein', 'proteins'] },
        { label: 'curd formation', variants: ['curd', 'curds', 'curd formation'] },
        { label: 'residual heat', variants: ['residual heat', 'carryover heat', 'carry over heat'] },
        { label: 'custard texture', variants: ['custard texture', 'custardy', 'custard-like'] },
        { label: 'temperature control', variants: ['temperature control', 'control the temperature'] }
      ]
    };
  }

  return { standard: [], advanced: [] };
}

/* ---------- WORD SCORE (DETERMINISTIC) ---------- */

function buildWordRubricText(question) {
  const auto = question.autoScoring || {};
  const standard = (auto.standardKeywords || []).map(k => `- ${k} (1 point)`).join('\n');
  const advanced = (auto.advancedKeywords || []).map(k => `- ${k} (2 points)`).join('\n');
  const rules = (auto.scoringRules || []).map(r => `- ${r}`).join('\n');

  return [
    `QUESTION: ${question.title}`,
    '',
    `SHARED WORD SCORE SYSTEM (MAX ${SHARED_WORD_MAX}):`,
    'Award points only for relevant word/concept coverage.',
    '',
    'STANDARD KEYWORDS / CONCEPTS (1 point each):',
    standard || '- None',
    '',
    'ADVANCED / INSIGHT KEYWORDS / CONCEPTS (2 points each):',
    advanced || '- None',
    '',
    'SCORING RULES:',
    rules || '- None'
  ].join('\n');
}

// Deterministic scoring for shared word points
async function scoreWordPoints(transcript, question) {
  const normalized = normalizeText(transcript);
  const spec = buildKeywordSpec(question.key);

  const matchedStandard = [];
  const matchedAdvanced = [];
  let standardPoints = 0;
  let advancedPoints = 0;

  for (const kw of spec.standard) {
    if (hasAnyPhrase(normalized, kw.variants)) {
      matchedStandard.push(kw.label);
      standardPoints += 1;
    }
  }

  for (const kw of spec.advanced) {
    if (hasAnyPhrase(normalized, kw.variants)) {
      matchedAdvanced.push(kw.label);
      advancedPoints += 2;
    }
  }

  let rawScore = standardPoints + advancedPoints;
  if (rawScore > SHARED_WORD_MAX) rawScore = SHARED_WORD_MAX;

  const explanationParts = [];
  if (matchedStandard.length) {
    explanationParts.push(
      `Standard concepts hit (${matchedStandard.length}): ${matchedStandard.join(', ')}.`
    );
  }
  if (matchedAdvanced.length) {
    explanationParts.push(
      `Advanced concepts hit (${matchedAdvanced.length}): ${matchedAdvanced.join(', ')}.`
    );
  }
  if (!explanationParts.length) {
    explanationParts.push('No predefined keywords or concept phrases were detected deterministically.');
  }

  const result = {
    word_score: rawScore,
    matched_standard: matchedStandard,
    matched_advanced: matchedAdvanced,
    explanation: explanationParts.join(' ')
  };

  console.log('DETERMINISTIC WORD SCORE RESULT:', JSON.stringify(result, null, 2));
  return result;
}

/* ---------- JUDGE HIDDEN VOTES / NORMALIZATION ---------- */

async function scoreJudgeHiddenVote(judge, transcript, question, wordResult) {
  const allowedVotesText = judge.allowedVotes.join(', ');

  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content: [
          'You are a TV speech competition judge.',
          `You are specifically ${judge.displayName}: ${judge.style}.`,
          'The shared word score has already been decided separately.',
          'You must NOT rescore keywords or concept coverage.',
          'Your only task is to choose a hidden discretion vote from the allowed options.',
          judge.discretionGuide,
          `Allowed hidden votes for you are: ${allowedVotesText}.`,
          'You must return exactly one of those allowed values.',
          'Return strict JSON with keys: hidden_vote, reason, headline.'
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Judge: ${judge.displayName}`,
          `Style: ${judge.style}`,
          '',
          `Question: ${question.title}`,
          '',
          'SHARED WORD SCORE ALREADY AWARDED:',
          `${wordResult.word_score}/${SHARED_WORD_MAX}`,
          '',
          'MATCHED STANDARD CONCEPTS:',
          wordResult.matched_standard.length ? wordResult.matched_standard.join(', ') : 'None',
          '',
          'MATCHED ADVANCED CONCEPTS:',
          wordResult.matched_advanced.length ? wordResult.matched_advanced.join(', ') : 'None',
          '',
          'CONTESTANT TRANSCRIPT:',
          transcript,
          '',
          'TASK:',
          `Choose one hidden discretion vote from these allowed values only: ${allowedVotesText}.`,
          'Do not change or reconsider the shared word score.',
          'The reason should be concise and in the judge voice.',
          'The headline should be short and punchy.'
        ].join('\n')
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'judge_hidden_vote',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            hidden_vote: {
              anyOf: judge.allowedVotes.map(v => ({ type: 'number', const: v }))
            },
            reason: { type: 'string' },
            headline: { type: 'string' }
          },
          required: ['hidden_vote', 'reason', 'headline']
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

function normalizeJudgeScore(wordScore, hiddenVote, hiddenVoteMax) {
  const rawTotal = wordScore + hiddenVote;
  const rawMax = SHARED_WORD_MAX + hiddenVoteMax;
  const normalized = Math.round((rawTotal / rawMax) * DISPLAYED_JUDGE_MAX);
  const displayedScore = Math.max(0, Math.min(DISPLAYED_JUDGE_MAX, normalized));

  return {
    rawTotal,
    rawMax,
    displayedScore
  };
}

function buildJudgePrompt(judge, transcript, judgeScore, question) {
  const questionLine = `Question: ${question.title}`;

  if (judge.displayName === 'Caty') {
    return `You are Caty, a blunt but entertaining TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Shared word score was ${judgeScore.wordScore}/${SHARED_WORD_MAX}.
Your hidden vote was ${judgeScore.hiddenVote}/${judgeScore.hiddenVoteMax}.
Your displayed final score is ${judgeScore.displayedScore}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Start with one specific strength.
- Give one practical improvement.
- End with the exact sentence: "I gave you ${judgeScore.displayedScore}."
- Sound direct, polished and TV-ready.`;
  }

  if (judge.displayName === 'Den') {
    return `You are Den, a harsh theatrical TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Shared word score was ${judgeScore.wordScore}/${SHARED_WORD_MAX}.
Your hidden vote was ${judgeScore.hiddenVote}/${judgeScore.hiddenVoteMax}.
Your displayed final score is ${judgeScore.displayedScore}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Be biting, funny and sharp, but not cruel.
- Mention one thing that failed.
- Mention one thing that worked better than expected.
- End with the exact sentence: "I gave you ${judgeScore.displayedScore}."
- Make it sound like a memorable TV verdict.`;
  }

  return `You are Tess, a warm, composed TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Shared word score was ${judgeScore.wordScore}/${SHARED_WORD_MAX}.
Your hidden vote was ${judgeScore.hiddenVote}/${judgeScore.hiddenVoteMax}.
Your displayed final score is ${judgeScore.displayedScore}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Focus on something positive if there is anything good to praise.
- Give one useful improvement.
- End with the exact sentence: "I gave you ${judgeScore.displayedScore}."
- Sound warm, encouraging and insightful.`;
}

async function generateJudgeScript(judge, transcript, judgeScore, question) {
  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content:
          'You are a TV talent judge. Return one spoken paragraph only. No bullet points, no labels, no stage directions.'
      },
      {
        role: 'user',
        content: buildJudgePrompt(judge, transcript, judgeScore, question)
      }
    ]
  });
  return response.output_text.trim();
}

async function synthesizeWithElevenLabs(text, voiceId, outFile) {
  if (!ELEVENLABS_API_KEY || !voiceId) {
    throw new Error('Missing ElevenLabs credentials or voice id.');
  }

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg'
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.78,
        style: 0.40,
        use_speaker_boost: true
      }
    })
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs error: ${res.status} ${errText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(outFile, Buffer.from(arrayBuffer));
}

function makeJudgeVideoWithPortrait(judge, audioPath, judgeScore) {
  const outVideo = path.join(OUTPUT, `${judge.id}-dramatic.mp4`);
  const duration = secondsOfMedia(audioPath);
  const revealStart = Math.max(duration - 2.6, 0.8);
  const revealEnd = duration;

  const nameText = `${judge.displayName}`;
  const headlineText = judgeScore.headline || `${judge.displayName} has spoken`;
  const scoreBig = `${judgeScore.displayedScore}`;
  const scoreSmall = `/11`;
  const verdictText = `${judge.displayName.toUpperCase()} GAVE YOU ${judgeScore.displayedScore}/11`;

  const alpha = alphaExpr(revealStart, 0.35, revealEnd, 0.20);

  const filter =
    `[2:a]aformat=channel_layouts=mono,showwaves=s=1280x170:mode=cline:colors=${judge.color}[wave];` +
    `[0:v]scale=1280:720[bg];` +
    `[bg][wave]overlay=0:550:shortest=1[v1];` +
    `[1:v]scale=290:-1,crop=290:290:(in_w-290)/2:(in_h-290)/2[face];` +
    `[v1][face]overlay=W-w-42:42:shortest=1[v2];` +
    `[v2]drawtext=text='${escapeDrawtext(nameText)}':fontcolor=white:fontsize=34:x=40:y=36:box=1:boxcolor=0x00000066:boxborderw=12[v3];` +
    `[v3]drawtext=text='${escapeDrawtext(headlineText)}':fontcolor=${judge.color}:fontsize=26:x=40:y=88:box=1:boxcolor=0x00000055:boxborderw=10[v4];` +
    `[v4]drawtext=text='${escapeDrawtext(scoreBig)}':fontcolor=${judge.color}:fontsize=170:x=(w-text_w)/2:y=220:alpha='${alpha}':enable='gte(t,${revealStart.toFixed(2)})'[v5];` +
    `[v5]drawtext=text='${escapeDrawtext(scoreSmall)}':fontcolor=white:fontsize=58:x=(w/2)+90:y=300:alpha='${alpha}':enable='gte(t,${revealStart.toFixed(2)})'[v6];` +
    `[v6]drawtext=text='${escapeDrawtext(verdictText)}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=430:box=1:boxcolor=0x00000088:boxborderw=14:alpha='${alpha}':enable='gte(t,${revealStart.toFixed(2)})'[outv]`;

  run('ffmpeg', [
    '-y',
    '-loop', '1',
    '-i', BACKGROUND_IMAGE,
    '-loop', '1',
    '-i', judge.portrait,
    '-i', audioPath,
    '-filter_complex', filter,
    '-map', '[outv]',
    '-map', '2:a',
    '-r', '25',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '160k',
    '-shortest',
    outVideo
  ]);

  return outVideo;
}

function makeFinalScoreCard(totalScore, maxScore) {
  const outVideo = path.join(OUTPUT, 'final-score-card.mp4');
  const duration = 4.5;
  const totalText = 'TOTAL SCORE';
  const scoreText = `${totalScore}/${maxScore}`;
  const subText =
    totalScore >= 25
      ? 'A commanding finish.'
      : totalScore >= 17
      ? 'A respectable showing.'
      : 'A tough room tonight.';

  const alpha1 = alphaExpr(0.30, 0.40, 2.10, 0.20);
  const alpha2 = alphaExpr(1.80, 0.35, 4.40, 0.20);

  const filter =
    `drawtext=text='${escapeDrawtext(totalText)}':fontcolor=white:fontsize=54:x=(w-text_w)/2:y=150:alpha='${alpha1}',` +
    `drawtext=text='${escapeDrawtext(scoreText)}':fontcolor=0xf6d54a:fontsize=180:x=(w-text_w)/2:y=250:alpha='${alpha2}',` +
    `drawtext=text='${escapeDrawtext(subText)}':fontcolor=white:fontsize=34:x=(w-text_w)/2:y=500:alpha='${alpha2}'`;

  run('ffmpeg', [
    '-y',
    '-loop', '1',
    '-t', String(duration),
    '-i', BACKGROUND_IMAGE,
    '-f', 'lavfi',
    '-t', String(duration),
    '-i', 'anullsrc=r=48000:cl=stereo',
    '-vf', `scale=1280:720,${filter}`,
    '-map', '0:v',
    '-map', '1:a',
    '-r', '25',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-shortest',
    outVideo
  ]);

  return outVideo;
}

function concatVideos(videoFiles, outFile) {
  const listPath = path.join(OUTPUT, 'judge-list.txt');
  fs.writeFileSync(
    listPath,
    videoFiles.map(v => `file '${path.basename(v)}'`).join('\n'),
    'ascii'
  );
  run('ffmpeg', [
    '-y',
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    outFile
  ]);
}

async function main() {
  checkFile(INPUT_VIDEO, 'input video');
  checkFile(BACKGROUND_IMAGE, 'background image');
  for (const judge of JUDGES) checkFile(judge.portrait, `${judge.displayName} portrait`);

  console.log(`Active question: ${ACTIVE_QUESTION.key} - ${ACTIVE_QUESTION.title}`);
  console.log('1) Transcribing contestant video...');
  const transcript = await transcribeVideoToText(INPUT_VIDEO);
  fs.writeFileSync(path.join(OUTPUT, 'contestant-transcript.txt'), transcript, 'utf8');

  console.log(`2) Calculating shared word score out of ${SHARED_WORD_MAX}...`);
  const wordResult = await scoreWordPoints(transcript, ACTIVE_QUESTION);
  console.log('WORD SCORE RESULT:', JSON.stringify(wordResult, null, 2));
  fs.writeFileSync(
    path.join(OUTPUT, 'word-score.json'),
    JSON.stringify(wordResult, null, 2),
    'utf8'
  );

  const createdVideos = [];
  const judgeResults = [];

  for (const judge of JUDGES) {
    console.log(`3) Scoring hidden vote for ${judge.displayName}...`);
    const hiddenVoteResult = await scoreJudgeHiddenVote(judge, transcript, ACTIVE_QUESTION, wordResult);
    console.log(
      `${judge.displayName} HIDDEN VOTE RESULT:`,
      JSON.stringify(hiddenVoteResult, null, 2)
    );

    const normalized = normalizeJudgeScore(
      wordResult.word_score,
      Number(hiddenVoteResult.hidden_vote),
      judge.hiddenVoteMax
    );

    console.log(
      `${judge.displayName} NORMALIZED SCORE:`,
      JSON.stringify(
        {
          word_score: wordResult.word_score,
          hidden_vote: Number(hiddenVoteResult.hidden_vote),
          hidden_vote_max: judge.hiddenVoteMax,
          raw_total: normalized.rawTotal,
          raw_max: normalized.rawMax,
          displayed_score: normalized.displayedScore
        },
        null,
        2
      )
    );

    const judgeScore = {
      score: normalized.displayedScore,
      displayedScore: normalized.displayedScore,
      wordScore: wordResult.word_score,
      hiddenVote: Number(hiddenVoteResult.hidden_vote),
      hiddenVoteMax: judge.hiddenVoteMax,
      rawTotal: normalized.rawTotal,
      rawMax: normalized.rawMax,
      headline: hiddenVoteResult.headline,
      reason: hiddenVoteResult.reason
    };

    judgeResults.push({
      judge: judge.displayName,
      score: normalized.displayedScore,
      word_score: wordResult.word_score,
      hidden_vote: Number(hiddenVoteResult.hidden_vote),
      hidden_vote_max: judge.hiddenVoteMax,
      raw_total: normalized.rawTotal,
      raw_max: normalized.rawMax,
      headline: hiddenVoteResult.headline,
      reason: hiddenVoteResult.reason,
      matched_standard: wordResult.matched_standard,
      matched_advanced: wordResult.matched_advanced
    });

    fs.writeFileSync(
      path.join(OUTPUT, `${judge.id}-score.json`),
      JSON.stringify(judgeScore, null, 2),
      'utf8'
    );

    console.log(`4) Generating critique for ${judge.displayName}...`);
    const script = await generateJudgeScript(judge, transcript, judgeScore, ACTIVE_QUESTION);
    fs.writeFileSync(path.join(OUTPUT, `${judge.id}-script.txt`), script, 'utf8');

    console.log(`5) Synthesizing audio for ${judge.displayName}...`);
    const audioOut = path.join(OUTPUT, `${judge.id}.mp3`);
    await synthesizeWithElevenLabs(script, judge.voiceId, audioOut);

    console.log(`6) Rendering dramatic judge segment for ${judge.displayName}...`);
    const videoOut = makeJudgeVideoWithPortrait(judge, audioOut, judgeScore);
    createdVideos.push(videoOut);
    console.log(`${judge.displayName} duration: ${secondsOfMedia(videoOut).toFixed(2)}s`);
  }

  const totalScore = judgeResults.reduce((sum, j) => sum + j.score, 0);
  const finalCard = makeFinalScoreCard(totalScore, 33);
  createdVideos.push(finalCard);

  console.log('7) Concatenating final program...');
  const finalOut = path.join(OUTPUT, 'round1-judges.mp4');
  concatVideos(createdVideos, finalOut);

  const summary = {
    input_video: INPUT_VIDEO,
    question_key: ACTIVE_QUESTION.key,
    topic: CONTESTANT.topic,
    transcript_file: path.join(OUTPUT, 'contestant-transcript.txt'),
    word_score: wordResult.word_score,
    word_score_max: SHARED_WORD_MAX,
    matched_standard: wordResult.matched_standard,
    matched_advanced: wordResult.matched_advanced,
    word_explanation: wordResult.explanation,
    judges: judgeResults,
    judge_1_score: judgeResults[0]?.score ?? null,
    judge_2_score: judgeResults[1]?.score ?? null,
    judge_3_score: judgeResults[2]?.score ?? null,
    total_score: totalScore,
    total_max: 33,
    final_video: finalOut,
    result_summary: `Question ${ACTIVE_QUESTION.key}. Shared word score ${wordResult.word_score}/${SHARED_WORD_MAX}. Final displayed scores — Caty: ${judgeResults[0]?.score ?? 0}, Den: ${judgeResults[1]?.score ?? 0}, Tess: ${judgeResults[2]?.score ?? 0}.`
  };

  fs.writeFileSync(
    path.join(OUTPUT, 'run-summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8'
  );
  console.log('Done. Final video:', finalOut);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});