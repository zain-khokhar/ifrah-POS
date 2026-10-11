const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const envPath = path.resolve(__dirname, '../.env.local');
const env = fs.readFileSync(envPath, 'utf8');
let dbUrl = '';
for (const line of env.split('\n')) {
  if (line.startsWith('DATABASE_URL=')) {
    dbUrl = line.substring('DATABASE_URL='.length).trim().replace(/^["']|["']$/g, '');
  }
}

const migrationPath = path.resolve(__dirname, '../supabase/migrations/20261011_phase13_schema.sql');
const sql = fs.readFileSync(migrationPath, 'utf8');

const client = new Client({
  connectionString: dbUrl,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  try {
    console.log('[1/3] Connecting to Supabase Postgres...');
    await client.connect();

    console.log('[2/3] Applying Phase 13 Schema Migration...');
    await client.query(sql);
    console.log('✅ Schema migration applied successfully!');

    console.log('[3/3] Verifying created tables...');
    const tablesRes = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);
    console.log('Created public tables (' + tablesRes.rows.length + '):');
    console.log(tablesRes.rows.map(r => r.table_name).join(', '));

    await client.end();
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  }
}

run();
