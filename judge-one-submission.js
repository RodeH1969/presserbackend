#!/usr/bin/env node
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { supabaseAdmin } from './supabase-client.js';
import { sendRoundResultEmail } from './email-client.js';

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, 'output');
fs.mkdirSync(OUTPUT, { recursive: true });

const INPUT_BUCKET = process.env.SUPABASE_INPUT_BUCKET || 'the-presser-input';
const OUTPUT_BUCKET = process.env.SUPABASE_OUTPUT_BUCKET || 'the-presser-output';

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

function buildInputPath(submission) {
  const round = submission.current_round || 1;

  if (round === 1 && submission.q1_path) return submission.q1_path;
  if (round === 2 && submission.q2_path) return submission.q2_path;
  if (round === 3 && submission.q3_path) return submission.q3_path;

  throw new Error(`No input video path found for submission ${submission.id} round ${round}`);
}

function getRoundFieldNames(round) {
  if (round === 1) {
    return {
      scoreField: 'q1_score_total',
      passedField: 'passed_q1',
      resultUrlField: 'q1_result_video_url',
      emailSentField: 'email_sent_q1'
    };
  }
  if (round === 2) {
    return {
      scoreField: 'q2_score_total',
      passedField: 'passed_q2',
      resultUrlField: 'q2_result_video_url',
      emailSentField: 'email_sent_q2'
    };
  }
  if (round === 3) {
    return {
      scoreField: 'q3_score_total',
      passedField: 'passed_q3',
      resultUrlField: 'q3_result_video_url',
      emailSentField: 'email_sent_q3'
    };
  }
  throw new Error(`Unsupported round ${round}`);
}

export async function judgeOneSubmission(submissionId) {
  console.log(`Judging submission ${submissionId}...`);

  const { data: submission, error: loadError } = await supabaseAdmin
    .from('submissions')
    .select('*')
    .eq('id', submissionId)
    .single();

  if (loadError) throw loadError;
  if (!submission) throw new Error(`Submission not found: ${submissionId}`);

  console.log('Loaded submission:', submission);

  const round = submission.current_round || 1;
  const questionKey = submission.question_key || `round${round}`;
  const inputStoragePath = buildInputPath(submission);
  const localInput = path.join(OUTPUT, `${submission.id}-input.mp4`);

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

  const judgeVideoPath = `judged-videos/${submission.id}/round${round}-judges.mp4`;

  console.log('3) Uploading judges video...');
  await uploadToStorage(judgeVideoPath, finalVideoLocal, 'video/mp4');

  console.log('4) Creating signed judges video URL...');
  const signedJudgeVideoUrl = await createSignedOutputUrl(judgeVideoPath);

  const fields = getRoundFieldNames(round);

  let nextRound = round;
  if (passed && round < 3) nextRound = round + 1;

  const updatePayload = {
    judge_video_path: judgeVideoPath,
    total_score: totalScore,
    max_score: maxScore,
    [fields.scoreField]: totalScore,
    [fields.passedField]: passed,
    [fields.resultUrlField]: signedJudgeVideoUrl,
    [fields.emailSentField]: false,
    current_round: nextRound,
    updated_at: new Date().toISOString()
  };

  console.log('5) Updating submissions row...');
  const { error: updateError } = await supabaseAdmin
    .from('submissions')
    .update(updatePayload)
    .eq('id', submission.id);

  if (updateError) throw updateError;

  let nextQuestionUrl = '';
  if (passed && round === 1) {
    nextQuestionUrl = `https://thepresserfrontend.onrender.com/question.html?submission_id=${submission.id}&round=2`;
  } else if (passed && round === 2) {
    nextQuestionUrl = `https://thepresserfrontend.onrender.com/question.html?submission_id=${submission.id}&round=3`;
  }

  if (submission.email) {
    console.log('6) Sending result email...');
    await sendRoundResultEmail({
      to: submission.email,
      tagName: submission.tag || submission.mobile || 'Contestant',
      round,
      passed,
      score: totalScore,
      maxScore,
      judgesVideoUrl: signedJudgeVideoUrl,
      nextQuestionUrl
    });

    await supabaseAdmin
      .from('submissions')
      .update({
        [fields.emailSentField]: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', submission.id);
  } else {
    console.log('No email on submission row, skipping email send.');
  }

  return {
    submissionId: submission.id,
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
  const submissionId = process.argv[2];
  if (!submissionId) {
    console.error('Usage: node judge-one-submission.js <submission-id>');
    process.exit(1);
  }

  try {
    const result = await judgeOneSubmission(submissionId);
    console.log('Done:', result);
  } catch (err) {
    console.error('judgeOneSubmission failed:', err);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  main();
}