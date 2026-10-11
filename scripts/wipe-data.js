const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function wipeAll() {
  console.log('========================================================');
  console.log('   STARTING COMPLETE SOFTWARE DATA WIPE');
  console.log('   (Licensing keys & license.lic are strictly preserved)');
  console.log('========================================================\n');

  // 1. Supabase PostgreSQL Wipe
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    let dbUrl = '';
    for (const line of envContent.split('\n')) {
      if (line.trim().startsWith('DATABASE_URL=')) {
        dbUrl = line.trim().split('DATABASE_URL=')[1].replace(/^["']|["']$/g, '');
      }
    }

    if (dbUrl) {
      console.log('[1/3] Connecting to Supabase Cloud Database...');
      const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
      try {
        await client.connect();
        console.log('  -> Connected to Supabase!');

        // Check tables in public schema
        const tablesRes = await client.query(`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        const tables = tablesRes.rows.map(r => r.table_name);
        console.log('  -> Supabase tables present:', tables);

        // Data tables to wipe (exclude 'licenses' if it exists!)
        const tablesToWipe = [
          'booking_items',
          'payments',
          'bookings',
          'customers',
          'dresses',
          'dress_categories',
          'relation_types',
          'casts',
          'cities',
          'users',
          'audit_logs',
          'settings'
        ].filter(t => tables.includes(t) && t !== 'licenses');

        if (tablesToWipe.length > 0) {
          console.log('  -> Truncating software data tables in Supabase:', tablesToWipe.join(', '));
          // TRUNCATE with CASCADE
          await client.query(`TRUNCATE TABLE ${tablesToWipe.map(t => `"${t}"`).join(', ')} CASCADE`);
          console.log('  -> Successfully wiped software data from Supabase!');
        }

        // Verify counts
        for (const t of tablesToWipe) {
          const c = await client.query(`SELECT count(*) as c FROM "${t}"`);
          console.log(`     Table [${t}]: ${c.rows[0].c} rows`);
        }

        if (tables.includes('licenses')) {
          const licCount = await client.query(`SELECT count(*) as c FROM "licenses"`);
          console.log(`  -> [PRESERVED] licenses table has ${licCount.rows[0].c} keys (untouched)`);
        }
      } catch (err) {
        console.error('  -> Supabase wipe error:', err.message);
      } finally {
        await client.end().catch(() => {});
      }
    }
  }

  // 2. Local AppData SQLite & Backups Wipe
  console.log('\n[2/3] Checking Local AppData Directory...');
  const appData = process.env.APPDATA || '';
  const appDataDirs = [
    path.join(appData, 'Ifrah Collection POS'),
    path.join(appData, 'ifrah-pos')
  ];

  for (const dir of appDataDirs) {
    if (fs.existsSync(dir)) {
      console.log(`  -> Found AppData directory: ${dir}`);

      // Verify license.lic exists and preserve it
      const licFile = path.join(dir, 'license.lic');
      if (fs.existsSync(licFile)) {
        console.log(`  -> [PRESERVED] Found license.lic at: ${licFile} (WILL NOT BE DELETED)`);
      }

      // Delete SQLite database files
      const dbDir = path.join(dir, 'database');
      if (fs.existsSync(dbDir)) {
        const files = fs.readdirSync(dbDir);
        for (const f of files) {
          const fullPath = path.join(dbDir, f);
          try {
            fs.unlinkSync(fullPath);
            console.log(`  -> Deleted DB file: ${fullPath}`);
          } catch (e) {
            console.error(`  -> Could not delete ${fullPath}:`, e.message);
          }
        }
      }

      // Delete Backups folder content
      const backupsDir = path.join(dir, 'backups');
      if (fs.existsSync(backupsDir)) {
        const files = fs.readdirSync(backupsDir);
        for (const f of files) {
          const fullPath = path.join(backupsDir, f);
          try {
            fs.unlinkSync(fullPath);
            console.log(`  -> Deleted backup file: ${fullPath}`);
          } catch (e) {
            console.error(`  -> Could not delete ${fullPath}:`, e.message);
          }
        }
      }

      // Delete photos if any
      const photosDir = path.join(dir, 'photos');
      if (fs.existsSync(photosDir)) {
        try {
          fs.rmSync(photosDir, { recursive: true, force: true });
          console.log(`  -> Deleted photos directory: ${photosDir}`);
        } catch (e) {
          console.error(`  -> Could not delete photos:`, e.message);
        }
      }
    }
  }

  // 3. Workspace SQLite files Wipe
  console.log('\n[3/3] Checking Workspace Database files...');
  const workspaceDbDir = path.join(__dirname, '..', 'database');
  if (fs.existsSync(workspaceDbDir)) {
    const files = fs.readdirSync(workspaceDbDir);
    for (const f of files) {
      if (f.endsWith('.sqlite') || f.endsWith('.sqlite-wal') || f.endsWith('.sqlite-shm')) {
        const fullPath = path.join(workspaceDbDir, f);
        try {
          fs.unlinkSync(fullPath);
          console.log(`  -> Deleted workspace DB file: ${fullPath}`);
        } catch (e) {
          console.error(`  -> Could not delete ${fullPath}:`, e.message);
        }
      }
    }
  }

  const workspacePhotos = path.join(__dirname, '..', 'photos');
  if (fs.existsSync(workspacePhotos)) {
    try {
      fs.rmSync(workspacePhotos, { recursive: true, force: true });
      console.log(`  -> Deleted workspace photos: ${workspacePhotos}`);
    } catch (e) {}
  }

  console.log('\n========================================================');
  console.log('   DATA WIPE COMPLETED SUCCESSFULLY!');
  console.log('   Software is now completely clean (scratch state).');
  console.log('   License keys / activation files were 100% preserved.');
  console.log('========================================================\n');
}

wipeAll().catch(err => {
  console.error('Fatal error during wipe:', err);
  process.exit(1);
});
