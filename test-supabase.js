#!/usr/bin/env node
import { supabaseAdmin } from './supabase-client.js';

async function main() {
  const { data, error } = await supabaseAdmin
    .from('submissions')
    .select('id, tag, mobile')
    .limit(3);

  if (error) {
    console.error(error);
    process.exit(1);
  }

  console.log(data);
}

main();