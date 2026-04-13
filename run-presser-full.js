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
    style: 'warm, supportive, emotionally intelligent'
  },
  {
    id: 'den',
    displayName: 'Den',
    portrait: path.join(ASSETS, 'Den.jpeg'),
    voiceId: ELEVENLABS_VOICE_DEN,
    color: '0xff3366',
    style: 'sharp, theatrical, cutting but entertaining'
  },
  {
    id: 'tess',
    displayName: 'Tess',
    portrait: path.join(ASSETS, 'Tess.jpeg'),
    voiceId: ELEVENLABS_VOICE_TESS,
    color: '0x66aaff',
    style: 'measured, technical, precise'
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

function buildRubricText(question) {
  const criteriaText = question.rubric.criteria
    .map(c => `- ${c.name} (${c.max}): ${c.guidance}`)
    .join('\n');

  const bandsText = question.rubric.bandGuide
    .map(b => `- ${b.label} (${b.scoreHint}): ${b.guidance}`)
    .join('\n');

  const notesText = (question.judgingNotes || [])
    .map(n => `- ${n}`)
    .join('\n');

  const examplesText = (question.examples || [])
    .map(ex => {
      const scorePart = typeof ex.score === 'number' ? ` (${ex.score}/11)` : '';
      return `- ${ex.label}${scorePart}: ${ex.text}`;
    })
    .join('\n');

  return [
    `QUESTION: ${question.title}`,
    '',
    'HIDDEN SCORING RUBRIC (/11):',
    criteriaText,
    '',
    'CALIBRATION BANDS:',
    bandsText,
    '',
    'JUDGING NOTES:',
    notesText || '- None',
    '',
    'EXAMPLE CALIBRATIONS:',
    examplesText || '- None'
  ].join('\n');
}

async function scoreJudge(judge, transcript, question) {
  const rubricText = buildRubricText(question);

  const response = await client.responses.create({
    model: 'gpt-4.1',
    input: [
      {
        role: 'system',
        content: [
          'You are a TV speech competition judge.',
          'You must internally use the provided hidden scoring rubric and example calibrations to decide the score.',
          'Do not reveal rubric sub-scores or mechanically describe the rubric.',
          'The rubric is shared by all judges so the score scale stays consistent.',
          `However, you are specifically ${judge.displayName}: ${judge.style}.`,
          'Let that personality affect tone, emphasis, and slight strictness, but keep the score grounded in the shared rubric.',
          'Return strict JSON with keys: score, reason, headline.'
        ].join(' ')
      },
      {
        role: 'user',
        content: [
          `Judge: ${judge.displayName}`,
          `Style: ${judge.style}`,
          '',
          rubricText,
          '',
          'CONTESTANT TRANSCRIPT:',
          transcript,
          '',
          'TASK:',
          'Score this answer out of 11 using the hidden rubric as your main guide.',
          'The reason should be concise and natural, written in this judge’s voice.',
          'The headline should be short, punchy, and in this judge’s voice.',
          'Do not output criterion-by-criterion marks.'
        ].join('\n')
      }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'judge_score',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            score: { type: 'integer', minimum: 0, maximum: 11 },
            reason: { type: 'string' },
            headline: { type: 'string' }
          },
          required: ['score', 'reason', 'headline']
        }
      }
    }
  });

  return JSON.parse(response.output_text);
}

function buildJudgePrompt(judge, transcript, judgeScore, question) {
  const questionLine = `Question: ${question.title}`;

  if (judge.displayName === 'Caty') {
    return `You are Caty, a warm but honest TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Your awarded score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Start with one specific strength.
- Give one practical improvement.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Sound supportive, polished and showbiz-ready.`;
  }

  if (judge.displayName === 'Den') {
    return `You are Den, a theatrical, sarcastic TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Your awarded score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Be biting, funny and sharp, but not cruel.
- Mention one thing that failed.
- Mention one thing that surprisingly worked.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Make it sound like a memorable TV verdict.`;
  }

  return `You are Tess, a calm, analytical TV judge.

${questionLine}

Contestant transcript:
"""${transcript}"""

Your awarded score is ${judgeScore.score}/11.
Your scoring reason was: ${judgeScore.reason}

Write a short spoken critique of about 30 to 42 words.
Requirements:
- Focus on structure, clarity or delivery.
- Give one technically useful improvement.
- End with the exact sentence: "I gave you ${judgeScore.score}."
- Sound composed, precise and authoritative.`;
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

  const createdVideos = [];
  const judgeResults = [];

  for (const judge of JUDGES) {
    console.log(`2) Scoring ${judge.displayName} out of 11...`);
    const judgeScore = await scoreJudge(judge, transcript, ACTIVE_QUESTION);
    judgeResults.push({
      judge: judge.displayName,
      score: judgeScore.score,
      headline: judgeScore.headline,
      reason: judgeScore.reason
    });
    fs.writeFileSync(
      path.join(OUTPUT, `${judge.id}-score.json`),
      JSON.stringify(judgeScore, null, 2),
      'utf8'
    );

    console.log(`3) Generating critique for ${judge.displayName}...`);
    const script = await generateJudgeScript(judge, transcript, judgeScore, ACTIVE_QUESTION);
    fs.writeFileSync(path.join(OUTPUT, `${judge.id}-script.txt`), script, 'utf8');

    console.log(`4) Synthesizing audio for ${judge.displayName}...`);
    const audioOut = path.join(OUTPUT, `${judge.id}.mp3`);
    await synthesizeWithElevenLabs(script, judge.voiceId, audioOut);

    console.log(`5) Rendering dramatic judge segment for ${judge.displayName}...`);
    const videoOut = makeJudgeVideoWithPortrait(judge, audioOut, judgeScore);
    createdVideos.push(videoOut);
    console.log(`${judge.displayName} duration: ${secondsOfMedia(videoOut).toFixed(2)}s`);
  }

  const totalScore = judgeResults.reduce((sum, j) => sum + j.score, 0);
  const finalCard = makeFinalScoreCard(totalScore, 33);
  createdVideos.push(finalCard);

  console.log('6) Concatenating final program...');
  const finalOut = path.join(OUTPUT, 'round1-judges.mp4');
  concatVideos(createdVideos, finalOut);

  const summary = {
    input_video: INPUT_VIDEO,
    question_key: ACTIVE_QUESTION.key,
    topic: CONTESTANT.topic,
    transcript_file: path.join(OUTPUT, 'contestant-transcript.txt'),
    judges: judgeResults,
    total_score: totalScore,
    total_max: 33,
    final_video: finalOut
  };

  fs.writeFileSync(path.join(OUTPUT, 'run-summary.json'), JSON.stringify(summary, null, 2), 'utf8');
  console.log('Done. Final video:', finalOut);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});