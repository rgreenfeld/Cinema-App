import { readFileSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, 'src/data.ts');
const backup = resolve(__dirname, 'src/data.ts.lockbak');
const cleanSource = resolve(__dirname, 'src/data.clean.ts');

// Read the clean content.
const clean = readFileSync(cleanSource, 'utf-8');

try {
  // 1) Try a direct write first (may fail if the file is memory-mapped).
  try {
    writeFileSync(target, clean, 'utf-8');
    console.log('✓ Direct write succeeded.');
  } catch (e) {
    console.log(`Direct write failed (${e.code || e.message}); trying rename dance...`);

    // 2) Rename the locked file aside (this often works without opening the file).
    let renamed = false;
    if (existsSync(target)) {
      try {
        renameSync(target, backup);
        renamed = true;
        console.log('✓ Locked file renamed aside.');
      } catch (e2) {
        console.log(`Rename aside failed: ${e2.code || e2.message}`);
      }
    }

    // 3) Write the clean file to the target path.
    writeFileSync(target, clean, 'utf-8');
    console.log('✓ Clean file written to target.');

    // 4) Clean up the backup if we renamed.
    if (renamed && existsSync(backup)) {
      try {
        unlinkSync(backup);
        console.log('✓ Backup removed.');
      } catch (e3) {
        console.log(`Backup cleanup skipped: ${e3.code || e3.message}`);
      }
    }
  }
} catch (err) {
  console.error(`✗ Could not fix ${target}: ${err.message}`);
  console.error('  The file may still be memory-mapped by the VS Code extension host.');
  process.exit(1);
}

// Verify.
try {
  const now = readFileSync(target, 'utf-8');
  const count = (now.match(/transformSupabaseRows/g) || []).length;
  const hasGetLocation = now.includes('getCinemaLocation');
  console.log(`Verification: size=${now.length} transformSupabaseRows=${count} getCinemaLocation=${hasGetLocation}`);
  if (count === 1 && hasGetLocation) {
    console.log('✓ src/data.ts is now the clean single-transform version.');
  } else {
    console.error('✗ Verification failed — content does not match expected clean file.');
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ Could not verify ${target}: ${e.message}`);
  process.exit(1);
}

