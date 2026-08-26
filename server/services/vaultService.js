const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VAULT_ROOT = path.join(__dirname, '..', 'vault');
const SEED_DIR = path.join(VAULT_ROOT, 'seed');
const MAX_BYTES = 1_500_000;
const NAME_RE = /^[A-Za-z0-9._-]+$/;
const KIND_BY_LABEL = [
  [/deed/i, 'deed'],
  [/financ|ppm|projection/i, 'financials'],
  [/inspect|tenant|agreement/i, 'inspection'],
];

function seedKindForName(name) {
  for (const [pattern, kind] of KIND_BY_LABEL) {
    if (pattern.test(name)) return kind;
  }
  return 'financials';
}

function seedDocUrl(propertyId, kind) {
  return `/api/vault/seed/${propertyId}-${kind}.pdf`;
}

function minimalPdf(title) {
  const label = String(title || 'RealtyChain document').replace(/[()\\]/g, ' ').slice(0, 80);
  const stream = `BT /F1 16 Tf 72 720 Td (${label}) Tj T* /F1 11 Tf (Demo vault file — not a recorded instrument.) Tj ET`;
  const streamLen = Buffer.byteLength(stream, 'utf8');
  const objects = [
    '1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj',
    '2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj',
    '3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj',
    `4 0 obj<< /Length ${streamLen} >>stream\n${stream}\nendstream\nendobj`,
    '5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj',
  ];
  let body = '%PDF-1.1\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += `${obj}\n`;
  }
  const xrefAt = Buffer.byteLength(body, 'utf8');
  let xref = `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  body += `${xref}trailer<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, 'utf8');
}

function ensureSeedFiles(properties) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
  for (const property of properties || []) {
    const id = String(property.id);
    const kinds = [
      ['deed', `${property.title} — Property Deed`],
      ['financials', `${property.title} — Financial projections`],
      ['inspection', `${property.title} — Inspection / leases`],
    ];
    for (const [kind, title] of kinds) {
      const file = path.join(SEED_DIR, `${id}-${kind}.pdf`);
      if (!fs.existsSync(file)) fs.writeFileSync(file, minimalPdf(title));
    }
  }
}

function rewritePlaceholderDocs(properties) {
  let changed = false;
  for (const property of properties || []) {
    if (!Array.isArray(property.documents)) continue;
    const next = property.documents.map((doc) => {
      const url = String(doc?.url || '').trim();
      if (url && url !== '#') return doc;
      return { name: doc.name, url: seedDocUrl(property.id, seedKindForName(doc.name)) };
    });
    if (JSON.stringify(next) !== JSON.stringify(property.documents)) {
      property.documents = next;
      changed = true;
    }
  }
  return changed;
}

function safeName(name) {
  const base = path.basename(String(name || ''));
  if (!NAME_RE.test(base)) return null;
  return base;
}

function seedPath(file) {
  const name = safeName(file);
  if (!name) return null;
  const full = path.join(SEED_DIR, name);
  if (!full.startsWith(SEED_DIR) || !fs.existsSync(full)) return null;
  return full;
}

function propertyDir(propertyId) {
  const id = String(propertyId || '').replace(/[^A-Za-z0-9_-]/g, '');
  if (!id) return null;
  return path.join(VAULT_ROOT, id);
}

function propertyFilePath(propertyId, file) {
  const dir = propertyDir(propertyId);
  const name = safeName(file);
  if (!dir || !name) return null;
  const full = path.join(dir, name);
  if (!full.startsWith(dir)) return null;
  return fs.existsSync(full) ? full : null;
}

function saveUpload(propertyId, filename, buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw Object.assign(new Error('File is empty.'), { status: 400 });
  }
  if (buffer.length > MAX_BYTES) {
    throw Object.assign(new Error('File is larger than 1.5 MB.'), { status: 400 });
  }
  const dir = propertyDir(propertyId);
  if (!dir) throw Object.assign(new Error('Invalid property id.'), { status: 400 });
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(filename || '').slice(0, 8) || '.bin';
  const stored = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  if (!NAME_RE.test(stored)) {
    throw Object.assign(new Error('Invalid file name.'), { status: 400 });
  }
  fs.writeFileSync(path.join(dir, stored), buffer);
  return {
    name: path.basename(filename || stored).slice(0, 120) || stored,
    url: `/api/vault/${propertyId}/${stored}`,
  };
}

function removeStoredFile(url) {
  const match = String(url || '').match(/^\/api\/vault\/([^/]+)\/([^/]+)$/);
  if (!match || match[1] === 'seed') return;
  const full = propertyFilePath(match[1], match[2]);
  if (full) {
    try {
      fs.unlinkSync(full);
    } catch {
      // ignore missing files
    }
  }
}

module.exports = {
  VAULT_ROOT,
  ensureSeedFiles,
  rewritePlaceholderDocs,
  seedDocUrl,
  seedPath,
  propertyFilePath,
  saveUpload,
  removeStoredFile,
  MAX_BYTES,
};
