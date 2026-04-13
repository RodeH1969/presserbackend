#!/usr/bin/env node
import { sendResultEmail } from './email-client.js';

async function main() {
  await sendResultEmail({
    to: 'roderickharding@hotmail.com',
    round: 1,
    totalScore: 22,
    maxScore: 33,
    videoUrl: 'https://example.com/fake-judges-round-1.webm',
    nextQuestionUrl: process.env.QUESTION_2_URL || 'https://example.com/question-2'
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});