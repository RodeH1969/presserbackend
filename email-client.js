import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendResultEmail({
  to,
  round,
  totalScore,
  maxScore,
  videoUrl,
  nextQuestionUrl
}) {
  const passed = totalScore > 20;

  const subject = `The Presser – Round ${round} results`;

  const bodyLines = [
    `<p>Your total score for round ${round} was <strong>${totalScore}/${maxScore}</strong>.</p>`,
  ];

  if (videoUrl) {
    bodyLines.push(
      `<p>You can watch your judged video here:</p>`,
      `<p><a href="${videoUrl}">${videoUrl}</a></p>`
    );
  }

  if (nextQuestionUrl && passed && round < 3) {
    bodyLines.push(
      `<p>Because you scored above 20, you’ve unlocked the next question:</p>`,
      `<p><a href="${nextQuestionUrl}">Go to question ${round + 1}</a></p>`
    );
  } else if (round === 3 && passed) {
    bodyLines.push(
      `<p>You scored above 20/33 on round 3 – you’re going onto today’s legends board.</p>`
    );
  } else if (!passed) {
    bodyLines.push(
      `<p>You needed more than 20/33 to advance. Thanks for playing The Presser.</p>`
    );
  }

  const html = [
    `<p>Hi from The Presser,</p>`,
    ...bodyLines,
    `<p>– The Judges</p>`
  ].join('\n');

  const { error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: [to],
    subject,
    html
  });

  if (error) {
    console.error('sendResultEmail error:', error);
    throw error;
  }
}