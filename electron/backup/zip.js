'use strict';

/**
 * electron/backup/zip.js
 *
 * Lightweight, zero-dependency ZIP archive creator and extractor.
 * Uses Node.js built-in 'zlib' and Buffer methods.
 * Generates standard PKZIP 2.0 archives readable by Windows Explorer, macOS, and Linux.
 */

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── CRC-32 TABLE ────────────────────────────────────────────────────────────

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c >>> 0;
}

function calcCrc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return ((c ^ 0xffffffff) >>> 0);
}

function toDosDateTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2));
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/**
 * Create a standard ZIP archive from a list of files or directories.
 * @param {Array<{ name: string, content?: Buffer, filePath?: string }>} entries
 * @param {string} outZipPath
 */
function createZipArchive(entries, outZipPath) {
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    let uncompressedData;
    if (entry.content) {
      uncompressedData = entry.content;
    } else if (entry.filePath && fs.existsSync(entry.filePath)) {
      uncompressedData = fs.readFileSync(entry.filePath);
    } else {
      continue;
    }

    const entryName = entry.name.replace(/\\/g, '/');
    const nameBytes = Buffer.from(entryName, 'utf8');
    const crc = calcCrc32(uncompressedData);
    const uncompressedSize = uncompressedData.length;

    // Deflate with standard zlib
    const deflated = zlib.deflateRawSync(uncompressedData);
    const useDeflate = deflated.length < uncompressedSize;
    const compressedData = useDeflate ? deflated : uncompressedData;
    const compressionMethod = useDeflate ? 8 : 0;
    const compressedSize = compressedData.length;

    const { time, date } = toDosDateTime();

    // 1. Local file header (30 bytes + name length)
    const localHeader = Buffer.alloc(30 + nameBytes.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Local header signature
    localHeader.writeUInt16LE(20, 4);         // Version needed: 2.0
    localHeader.writeUInt16LE(0, 6);          // Flags
    localHeader.writeUInt16LE(compressionMethod, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28);         // Extra field length
    nameBytes.copy(localHeader, 30);

    localChunks.push(localHeader);
    localChunks.push(compressedData);

    // 2. Central directory header (46 bytes + name length)
    const centralHeader = Buffer.alloc(46 + nameBytes.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Central header signature
    centralHeader.writeUInt16LE(20, 4);          // Version made by
    centralHeader.writeUInt16LE(20, 6);          // Version needed
    centralHeader.writeUInt16LE(0, 8);           // Flags
    centralHeader.writeUInt16LE(compressionMethod, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30);          // Extra field length
    centralHeader.writeUInt16LE(0, 32);          // File comment length
    centralHeader.writeUInt16LE(0, 34);          // Disk start
    centralHeader.writeUInt16LE(0, 36);          // Internal attributes
    centralHeader.writeUInt32LE(0, 38);          // External attributes
    centralHeader.writeUInt32LE(offset, 42);     // Relative offset of local header
    nameBytes.copy(centralHeader, 46);

    centralChunks.push(centralHeader);

    offset += localHeader.length + compressedData.length;
  }

  const centralDirSize = centralChunks.reduce((acc, c) => acc + c.length, 0);
  const centralDirOffset = offset;
  const totalEntries = centralChunks.length;

  // 3. End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);            // Disk number
  eocd.writeUInt16LE(0, 6);            // Start disk
  eocd.writeUInt16LE(totalEntries, 8); // Entries on disk
  eocd.writeUInt16LE(totalEntries, 10);// Total entries
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);           // Comment length

  const fullBuffer = Buffer.concat([...localChunks, ...centralChunks, eocd]);
  const outDir = path.dirname(outZipPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  fs.writeFileSync(outZipPath, fullBuffer);
  return { ok: true, sizeBytes: fullBuffer.length, entriesCount: totalEntries };
}

/**
 * Extract files from a standard ZIP archive into a destination folder.
 * @param {string} zipFilePath
 * @param {string} destDir
 */
function extractZipArchive(zipFilePath, destDir) {
  if (!fs.existsSync(zipFilePath)) {
    throw new Error(`Zip file not found: ${zipFilePath}`);
  }

  const buf = fs.readFileSync(zipFilePath);
  let pos = 0;
  const extractedFiles = [];

  while (pos < buf.length - 4) {
    const sig = buf.readUInt32LE(pos);

    // Stop if we hit the Central Directory header
    if (sig === 0x02014b50 || sig === 0x06054b50) {
      break;
    }

    if (sig !== 0x04034b50) {
      pos++;
      continue;
    }

    // Read local header
    const compression = buf.readUInt16LE(pos + 8);
    const compressedSize = buf.readUInt32LE(pos + 18);
    const uncompressedSize = buf.readUInt32LE(pos + 22);
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);

    const name = buf.toString('utf8', pos + 30, pos + 30 + nameLen);
    const dataStart = pos + 30 + nameLen + extraLen;
    const compressedData = buf.subarray(dataStart, dataStart + compressedSize);

    let uncompressedData;
    if (compression === 8) {
      uncompressedData = zlib.inflateRawSync(compressedData);
    } else if (compression === 0) {
      uncompressedData = compressedData;
    } else {
      throw new Error(`Unsupported zip compression method: ${compression}`);
    }

    const outPath = path.join(destDir, name);
    const targetDir = path.dirname(outPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    fs.writeFileSync(outPath, uncompressedData);
    extractedFiles.push(outPath);

    pos = dataStart + compressedSize;
  }

  return { ok: true, files: extractedFiles };
}

module.exports = {
  createZipArchive,
  extractZipArchive,
  calcCrc32,
};
