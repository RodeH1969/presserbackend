#!/usr/bin/env node
import 'dotenv/config';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

async function main() {
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL,
    to: ['roderickharding@hotmail.com'],
    subject: 'The Presser email test',
    html: '<p>Resend is working for The Presser.</p>'
  });

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(data);
}

main();