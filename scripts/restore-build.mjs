import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';

const root = process.cwd();
const archiveDir = join(root, 'bootstrap');
const sourceDir = join(root, '.source');
const outputDir = join(root, 'dist');

function safePath(base, relativePath) {
  const clean = normalize(relativePath.replaceAll('\\', '/')).replace(/^([/\\])+/, '');
  const target = resolve(base, clean);
  const prefix = `${resolve(base)}${sep}`;
  if (target !== resolve(base) && !target.startsWith(prefix)) {
    throw new Error(`Unsafe archive path: ${relativePath}`);
  }
  return target;
}

async function reconstructArchive() {
  const parts = (await readdir(archiveDir))
    .filter((name) => /^part-\d+\.txt$/.test(name))
    .sort();

  if (!parts.length) throw new Error('No bootstrap archive parts were found.');

  const encoded = (await Promise.all(parts.map((name) => readFile(join(archiveDir, name), 'utf8'))))
    .join('')
    .replace(/\s+/g, '');

  return Buffer.from(encoded, 'base64');
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
