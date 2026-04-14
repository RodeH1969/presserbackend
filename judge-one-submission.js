#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { supabaseAdmin } from './supabase-client.js';
import { sendResultEmail } from './email-client.js';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'output');
fs.mkdirSync(OUTPUT, { recursive: true });

// Hardcode the real bucket name from Supabase Storage
const INPUT_BUCKET = 'recordings';
const OUTPUT_BUCKET = 'recordings';

function runNodeScript(script, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [script, ...args], {
      cwd: ROOT,
      stdio: 'inherit',
      shell: false
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`node exited with code ${code}`));
    });
  });
}

async function downloadFromStorage(storagePath, localPath) {
  const { data, error } = await supabaseAdmin.storage
    .from(INPUT_BUCKET)
    .download(storagePath);

  if (error) throw error;

  const buffer = Buffer.from(await data.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
}

async function uploadToStorage(storagePath, localPath, contentType = 'video/mp4') {
  const fileBuffer = fs.readFileSync(localPath);

  const { error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType,
      upsert: true
    });

  if (error) throw error;
}

async function createSignedOutputUrl(storagePath, expiresIn = 60 * 60 * 24 * 7) {
  const { data, error } = await supabaseAdmin.storage
    .from(OUTPUT_BUCKET)
    .createSignedUrl(storagePath, expiresIn);

  if (error) throw error;
  return data.signedUrl;
}

export async function judgeOneSubmission(attemptId) {
  console.log(`Judging attempt ${attemptId}...`);

  // 1) Load attempt row from attempts table
  const { data: attempt, error: loadError } = await supabaseAdmin
    .from('attempts')
    .select('*')
    .eq('id', attemptId)
    .single();

  if (loadError) throw loadError;
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

  console.log('Loaded attempt:', attempt);

  const round = attempt.round_number || 1;
  const questionKey = `round${round}`;

  const inputStoragePath = attempt.recording_path;
  if (!inputStoragePath) {
    throw new Error(`No recording_path found for attempt ${attempt.id}`);
  }

  const localInput = path.join(OUTPUT, `${attempt.id}-input.webm`);

  console.log('1) Downloading contestant submission from Storage...');
  await downloadFromStorage(inputStoragePath, localInput);

  console.log('2) Running judging pipeline...');
  await runNodeScript('run-presser-full.js', [localInput, questionKey]);

  const summaryPath = path.join(OUTPUT, 'run-summary.json');
  if (!fs.existsSync(summaryPath)) {
    throw new Error('run-summary.json not found after judging');
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'));
  const totalScore = Number(summary.total_score || 0);
  const maxScore = Number(summary.total_max || 33);
  const passed = totalScore >= 17;

  const finalVideoLocal = summary.final_video;
  if (!finalVideoLocal || !fs.existsSync(finalVideoLocal)) {
    throw new Error('Final video not found after judging');
  }

  const judgeVideoPath = `judged-videos/${attempt.id}/round${round}-judges.mp4`;

  console.log('3) Uploading judges video...');
  await uploadToStorage(judgeVideoPath, finalVideoLocal, 'video/mp4');

  console.log('4) Creating signed judges video URL...');
  const signedJudgeVideoUrl = await createSignedOutputUrl(judgeVideoPath);

  console.log('5) Updating attempts row with scores and result...');
  const { error: updateError } = await supabaseAdmin
  .from('attempts')
  .update({
    judge_1_score: summary.judge_1_score ?? null,
    judge_2_score: summary.judge_2_score ?? null,
    judge_3_score: summary.judge_3_score ?? null,
    total_score: totalScore,
    passed,
    result_summary: summary.result_summary ?? null,
    result_video_url: signedJudgeVideoUrl,
    status: 'judged',
    updated_at: new Date().toISOString()
  })
  .eq('id', attempt.id);

  if (updateError) throw updateError;

  let nextQuestionUrl = '';
  if (passed && round === 1) {
    nextQuestionUrl = 'https://thepresserfrontend.onrender.com/question.html?round=2';
  } else if (passed && round === 2) {
    nextQuestionUrl = 'https://thepresserfrontend.onrender.com/question.html?round=3';
  }

  // NOTE: attempts table doesn’t have an email column in the CSV you sent,
  // so we skip email send for now. Once we know where contestant email lives,
  // we can join on contestant_id and call sendResultEmail here.

  return {
    attemptId: attempt.id,
    round,
    passed,
    totalScore,
    maxScore,
    judgeVideoPath,
    signedJudgeVideoUrl,
    nextQuestionUrl
  };
}

async function main() {
  const attemptId = process.argv[2];
  if (!attemptId) {
    console.error('Usage: node judge-one-submission.js <attempt-id>');
    process.exit(1);
  }

  try {
    const result = await judgeOneSubmission(attemptId);
    console.log('Done:', result);
  } catch (err) {
    console.error('judgeOneSubmission failed:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}