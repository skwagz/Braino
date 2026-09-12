import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { createDrive } from './drive.ts';
import { previewOrganization, applyOrganization } from './organizer.ts';
import { planStructure } from './structure.ts';
import { authConfig, savedAccessToken } from './auth/google.ts';

async function main() {
  const [command, target, output] = process.argv.slice(2);
  if (!['preview', 'apply'].includes(command) || !target || (command === 'apply' && output)) {
    throw new Error('Usage: npm run organize -- preview <folder-id> [preview-name.json] | apply <preview-name.json>');
  }
  const accessToken = process.env.GOOGLE_ACCESS_TOKEN?.trim()
    ? () => process.env.GOOGLE_ACCESS_TOKEN!
    : savedAccessToken(authConfig());
  const drive = createDrive({ accessToken });
  const directory = resolve('private-data');
  await mkdir(directory, { recursive: true });
  // All artifacts stay in the ignored private-data directory.
  function artifact(name: string) {
    if (!/^[a-zA-Z0-9_-]+\.json$/.test(name)) throw new Error('Use a simple .json filename without directories');
    return join(directory, name);
  }
  if (command === 'preview') {
    const path = artifact(output ?? 'preview.json');
    const preview = await previewOrganization({ folderId: target, drive });
    const plan = planStructure(preview.report, preview.state);
    const file = await open(path, 'wx');
    try { await file.writeFile(JSON.stringify(preview, null, 2)); await file.sync(); }
    finally { await file.close(); }
    console.log(JSON.stringify({ preview: path, complete: preview.report.complete,
      folders: preview.report.folders, review: preview.report.review,
      errors: preview.report.errors, blocked: plan.blocked, operations: plan.operations }, null, 2));
    return;
  }
  const preview = JSON.parse(await readFile(artifact(target), 'utf8'));
  if (typeof preview.report?.sourceFolderId !== 'string') throw new Error('Invalid preview');
  const key = createHash('sha256').update(preview.report.sourceFolderId).digest('hex');
  const lockPath = join(directory, `${key}.lock`);
  const lock = await open(lockPath, 'wx');
  let journal: Awaited<ReturnType<typeof open>> | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, started: new Date().toISOString() }));
    const journalPath = join(directory, `${key}-${Date.now()}.jsonl`);
    journal = await open(journalPath, 'wx');
    const record = async (event: unknown) => {
      await journal!.writeFile(JSON.stringify({ at: new Date().toISOString(), event }) + '\n');
      await journal!.sync();
    };
    try {
      const result = await applyOrganization(preview, drive, record);
      console.log(JSON.stringify({ ...result, journal: journalPath }));
    } catch (error) {
      await record({ type: 'failed', message: String(error) });
      throw error;
    }
  } finally {
    await journal?.close();
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
