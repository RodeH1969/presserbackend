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
const QUESTION_KEY = process.argv[3] || 'round1';
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
    style: 'blunt, sharp, direct, cuts through waffle fast',
    discretionGuide:
      'You are balanced but blunt. Award 0-3 discretion points for overall quality, clarity, flair, and persuasion. 0 = weak or messy. 1 = okay but basic. 2 = clearly good and effective. 3 = punchy, polished, memorable, persuasive.'
  },
  {
    id: 'den',
    displayName: 'Den',
    portrait: path.join(ASSETS, 'Den.jpeg'),
    voiceId: ELEVENLABS_VOICE_DEN,
    color: '0xff3366',
    style: 'cold, demanding, theatrical, cutting but entertaining',
    discretionGuide:
      'You are the harshest judge. Award 0-3 discretion points for overall quality, clarity, flair, and persuasion. 0 = poor or flat. 1 = decent but ordinary. 2 = genuinely strong. 3 = exceptional and rare. Most merely decent answers should get 1 from you.'
  },
  {
    id: 'tess',
    displayName: 'Tess',
    portrait: path.join(ASSETS, 'Tess.jpeg'),
    voiceId: ELEVENLABS_VOICE_TESS,
    color: '0x66aaff',
    style: 'warm, calm, encouraging, attentive to voice and human connection',
    discretionGuide:
      'You are the warmest judge. Award 0-3 discretion points for overall quality, clarity, flair, and persuasion. 0 = weak or hard to follow. 1 = decent but plain. 2 = good, clear, engaging. 3 = compelling, memorable, confident, persuasive. If someone does a solid job with personality, lean 2 rather than 1.'
  }
];

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

function buildAutoRubricText(question) {
  const auto = question.autoScoring || {};
  const standard = (auto.standardKeywords || []).map(k => `- ${k} (1 point)`).join('\n');
  const advanced = (auto.advancedKeywords || []).map(k => `- ${k} (2 points)`).join('\n');
  const rules = (auto.scoringRules || []).map(r => `- ${r}`).join('\n');
  const examples = (question.examples || [])
    .map(ex => {
      const scorePart = typeof ex.score === 'number' ? ` (${ex.score}/11)` : '';
      return `- ${ex.label}${scorePart}: ${ex.text}`;
    })
    .join('\n');

  return [
    `QUESTION: ${question.title}`,
    '',
    'AUTO POINTS SYSTEM (MAX 8):',
    'Award points for relevant keyword/concept coverage only.',
    '',
    'STANDARD KEYWORDS / CONCEPTS (1 point each):',
    standard || '- None',
    '',
    'ADVANCED / INSIGHT KEYWORDS / CONCEPTS (2 points each):',
    advanced || '- None',
    '',
    'SCORING RULES:',
    rules || '- None',
    '',
    'EXAMPLE CALIBRATIONS:',
    examples || '- None'
  ].join('\n');
}

async function scoreAutoPoints(transcript, question) {
  const rubricText = buildAutoRubricText(question);

  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content: [
          'You are an exact scoring engine.',
          'Your task is to award AUTO POINTS ONLY.',
          'Do not judge flair, clarity, charisma, or persuasion.',
          'Only award points for relevant keyword or concept coverage from the provided checklist.',
          'Standard keywords/concepts are worth 1 point each.',
          'Advanced/insight keywords/concepts are worth 2 points each.',
          'Count synonyms and clearly equivalent phrasing.',
          'Do not double-count the same idea repeatedly.',
          'Cap the total auto score at 8.',
          'Be fair and give credit when the contestant clearly expresses the concept even if the wording is not exact.',
          'Return strict JSON only.'
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          rubricText,
          '',
          'CONTESTANT TRANSCRIPT:',
          transcript,
          '',
          'TASK:',
          'Compute the auto score out of 8.',
          'List which matched standard concepts were counted.',
          'List which matched advanced concepts were counted.',
          'Give a brief explanation.'
        ].join('\n')
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'auto_score',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            auto_score: { type: 'integer', minimum: 0, maximum: 8 },
            matched_standard: {
              type: 'array',
              items: { type: 'string' }
            },
            matched_advanced: {
              type: 'array',
              items: { type: 'string' }
            },
            explanation: { type: 'string' }
          },
          required: ['auto_score', 'matched_standard', 'matched_advanced', 'explanation']
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

async function scoreJudgeDiscretion(judge, transcript, question, autoResult) {
  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content: [
          'You are a TV speech competition judge.',
          `You are specifically ${judge.displayName}: ${judge.style}.`,
          'The AUTO score has already been decided separately.',
          'You must NOT rescore keyword coverage.',
          'Your ONLY task is to award 0-3 discretion points for overall quality, clarity, flair, and persuasion.',
          judge.discretionGuide,
          'Return strict JSON with keys: discretion_score, reason, headline.'
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
          'AUTO SCORE ALREADY AWARDED:',
          `${autoResult.auto_score}/8`,
          '',
          'MATCHED STANDARD CONCEPTS:',
          autoResult.matched_standard.length ? autoResult.matched_standard.join(', ') : 'None',
          '',
          'MATCHED ADVANCED CONCEPTS:',
          autoResult.matched_advanced.length ? autoResult.matched_advanced.join(', ') : 'None',
          '',
          'CONTESTANT TRANSCRIPT:',
          transcript,
          '',
          'TASK:',
          'Award discretion points only (0-3).',
          'Do not change or reconsider the auto score.',
          'The reason should be concise and natural, written in this judge’s voice.',
          'The headline should be short, punchy, and in this judge’s voice.'
        ].join('\n')
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'judge_discretion',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            discretion_score: { type: 'integer', minimum: 0, maximum: 3 },
            reason: { type: 'string' },
            headline: { type: 'string' }
          },
          required: ['discretion_score', 'reason', 'headline']
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

function buildJudgePrompt(judge, transcript, judgeScore, question) {
  const questionLine = `Question: ${question.title}`;

  if (judge.displayName === 'Caty') {
    return `You are Caty, a blunt but entertaining TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Auto score was ${judgeScore.autoScore}/8.
Your discretion score was ${judgeScore.discretionScore}/3.
Final score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Start with one specific strength.
- Give one practical improvement.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Sound direct, polished and TV-ready.`;
  }

  if (judge.displayName === 'Den') {
    return `You are Den, a harsh theatrical TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Auto score was ${judgeScore.autoScore}/8.
Your discretion score was ${judgeScore.discretionScore}/3.
Final score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Be biting, funny and sharp, but not cruel.
- Mention one thing that failed.
- Mention one thing that surprisingly worked.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Make it sound like a memorable TV verdict.`;
  }

  return `You are Tess, a warm, composed TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Auto score was ${judgeScore.autoScore}/8.
Your discretion score was ${judgeScore.discretionScore}/3.
Final score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Focus on clarity, quality, or delivery.
- Give one useful improvement.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Sound calm, encouraging and insightful.`;
}

async function generateJudgeScript(judge, transcript, judgeScore, question) {
  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content: 'You are a TV talent judge. Return one spoken paragraph only. No bullet points, no labels, no stage directions.'
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
  const scoreBig = `${judgeScore.score}`;
  const scoreSmall = `/11`;
  const verdictText = `${judge.displayName.toUpperCase()} GAVE YOU ${judgeScore.score}/11`;

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

  console.log('2) Calculating shared auto score out of 8...');
  const autoResult = await scoreAutoPoints(transcript, ACTIVE_QUESTION);
  fs.writeFileSync(
    path.join(OUTPUT, 'auto-score.json'),
    JSON.stringify(autoResult, null, 2),
    'utf8'
  );

  const createdVideos = [];
  const judgeResults = [];

  for (const judge of JUDGES) {
    console.log(`3) Scoring discretion for ${judge.displayName}...`);
    const discretion = await scoreJudgeDiscretion(judge, transcript, ACTIVE_QUESTION, autoResult);

    const finalScore = autoResult.auto_score + discretion.discretion_score;

    const judgeScore = {
      score: finalScore,
      autoScore: autoResult.auto_score,
      discretionScore: discretion.discretion_score,
      headline: discretion.headline,
      reason: discretion.reason
    };

    judgeResults.push({
      judge: judge.displayName,
      score: finalScore,
      auto_score: autoResult.auto_score,
      discretion_score: discretion.discretion_score,
      headline: discretion.headline,
      reason: discretion.reason,
      matched_standard: autoResult.matched_standard,
      matched_advanced: autoResult.matched_advanced
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
    auto_score: autoResult.auto_score,
    matched_standard: autoResult.matched_standard,
    matched_advanced: autoResult.matched_advanced,
    auto_explanation: autoResult.explanation,
    judges: judgeResults,
    judge_1_score: judgeResults[0]?.score ?? null,
    judge_2_score: judgeResults[1]?.score ?? null,
    judge_3_score: judgeResults[2]?.score ?? null,
    total_score: totalScore,
    total_max: 33,
    final_video: finalOut,
    result_summary: `Auto score ${autoResult.auto_score}/8. Final scores — Caty: ${judgeResults[0]?.score ?? 0}, Den: ${judgeResults[1]?.score ?? 0}, Tess: ${judgeResults[2]?.score ?? 0}.`
  };

  fs.writeFileSync(path.join(OUTPUT, 'run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('Done. Final video:', finalOut);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});