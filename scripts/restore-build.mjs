import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';

const root = process.cwd();
const archiveDir = join(root, 'bootstrap');
const sourceDir = join(root, '.source');
const outputDir = join(root, 'dist');
const rawBase = 'https://raw.githubusercontent.com/M1gu3hb/UI-lab/main/bootstrap';
const partCount = 14;
const expectedArchiveHash = '24bea0e9ddcc48bf13c01eb3622a68d78ef261586e249c1d2c9264a925832391';

function safePath(base, relativePath) {
  const clean = normalize(relativePath.replaceAll('\\', '/')).replace(/^([/\\])+/, '');
  const target = resolve(base, clean);
  const prefix = `${resolve(base)}${sep}`;
  if (target !== resolve(base) && !target.startsWith(prefix)) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return target;
}

async function readLocalParts() {
  try {
    const parts = (await readdir(archiveDir))
      .filter((name) => /^part-\d+\.txt$/.test(name))
      .sort();
    if (!parts.length) return null;
    return Promise.all(parts.map((name) => readFile(join(archiveDir, name), 'utf8')));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function fetchRepositoryParts() {
  const parts = [];
  for (let index = 0; index < partCount; index += 1) {
    const name = `part-${String(index).padStart(3, '0')}.txt`;
    const response = await fetch(`${rawBase}/${name}`, {
      headers: { 'user-agent': 'ui-lab-vercel-build' },
    });
    if (!response.ok) {
      throw new Error(`Unable to fetch ${name} from GitHub: ${response.status} ${response.statusText}`);
    }
    parts.push(await response.text());
  }
  return parts;
}

async function reconstructArchive() {
  const parts = (await readLocalParts()) ?? (await fetchRepositoryParts());
  const encoded = parts.join('').replace(/\s+/g, '');
  const archive = Buffer.from(encoded, 'base64');
  const hash = createHash('sha256').update(archive).digest('hex');
  if (hash !== expectedArchiveHash) {
    throw new Error(`Source archive integrity check failed: ${hash}`);
  }
  return archive;
}

async function extractZip(buffer, destination) {
  let offset = 0;
  let files = 0;

  while (offset + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature === 0x02014b50 || signature === 0x06054b50) break;
    if (signature !== 0x04034b50) throw new Error(`Invalid ZIP signature at byte ${offset}.`);

    const flags = buffer.readUInt16LE(offset + 6);
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const uncompressedSize = buffer.readUInt32LE(offset + 22);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);

    if (flags & 0x08) {
      throw new Error('ZIP data descriptors are not supported by the deterministic bootstrap archive.');
    }

    const nameStart = offset + 30;
    const dataStart = nameStart + nameLength + extraLength;
    const dataEnd = dataStart + compressedSize;
    const name = buffer.subarray(nameStart, nameStart + nameLength).toString('utf8');

    if (!name) throw new Error('ZIP entry has an empty name.');
    if (dataEnd > buffer.length) throw new Error(`ZIP entry exceeds archive bounds: ${name}`);

    const target = safePath(destination, name);
    if (name.endsWith('/')) {
      await mkdir(target, { recursive: true });
    } else {
      await mkdir(dirname(target), { recursive: true });
      const compressed = buffer.subarray(dataStart, dataEnd);
      let data;
      if (method === 0) data = compressed;
      else if (method === 8) data = inflateRawSync(compressed);
      else throw new Error(`Unsupported ZIP compression method ${method} for ${name}`);
      if (uncompressedSize && data.length !== uncompressedSize) {
        throw new Error(`Size mismatch for ${name}: expected ${uncompressedSize}, received ${data.length}`);
      }
      await writeFile(target, data);
      files += 1;
    }

    offset = dataEnd;
  }

  if (!files) throw new Error('The bootstrap archive did not contain files.');
  return files;
}

async function main() {
  await rm(sourceDir, { recursive: true, force: true });
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(sourceDir, { recursive: true });

  const archive = await reconstructArchive();
  const count = await extractZip(archive, sourceDir);

  const result = spawnSync('npm', ['run', 'build'], {
    cwd: sourceDir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) throw new Error(`Inner project build failed with exit code ${result.status}.`);

  await cp(join(sourceDir, 'dist'), outputDir, { recursive: true });
  console.log(`Restored ${count} source files and copied validated output to dist/.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
