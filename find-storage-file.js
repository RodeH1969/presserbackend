#!/usr/bin/env node
import 'dotenv/config';
import { supabaseAdmin } from './supabase-client.js';

const BUCKET = 'the-presser-input';

async function listPath(path) {
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(path, {
      limit: 100,
      offset: 0,
      sortBy: { column: 'name', order: 'asc' }
    });

  if (error) {
    console.error(`Error listing "${path}":`, error);
    return [];
  }

  console.log(`\nContents of "${path || '/'}":`);
  for (const item of data) {
    console.log('-', item.name);
  }
  return data;
}

async function main() {
  const submissionId = process.argv[2];

  if (!submissionId) {
    console.error('Usage: node find-storage-file.js <submission-id>');
    process.exit(1);
  }

  const root = await listPath('');
  const submissions = await listPath('submissions');

  const possible = [...root, ...submissions].filter(
    x => x.name && x.name.includes(submissionId)
  );

  console.log('\nPossible matches:');
  if (possible.length === 0) {
    console.log('No filenames contained that submission id.');
  } else {
    for (const item of possible) {
      console.log('-', item.name);
    }
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});