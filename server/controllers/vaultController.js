const path = require('path');
const vault = require('../services/vaultService');
const propertyService = require('../services/propertyService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Vault error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function sendFile(res, filePath) {
  if (!filePath) return res.status(404).json({ error: 'Document not found' });
  return res.sendFile(path.resolve(filePath));
}

function seed(req, res) {
  return sendFile(res, vault.seedPath(req.params.file));
}

function propertyFile(req, res) {
  return sendFile(res, vault.propertyFilePath(req.params.propertyId, req.params.file));
}

function upload(req, res) {
  try {
    const property = propertyService.getById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    const name = String(req.body?.name || '').trim();
    const filename = String(req.body?.filename || 'document.pdf');
    const data = String(req.body?.data || '').replace(/^data:[^;]+;base64,/, '');
    if (!name) return res.status(400).json({ error: 'Document name is required.' });
    if (!data) return res.status(400).json({ error: 'File data is required.' });
    let buffer;
    try {
      buffer = Buffer.from(data, 'base64');
    } catch {
      return res.status(400).json({ error: 'File data must be base64.' });
    }
    const stored = vault.saveUpload(property.id, filename, buffer);
    stored.name = name.slice(0, 120);
    const documents = [...(property.documents || []), stored];
    return res.status(201).json({ property: propertyService.update(property.id, { documents }) });
  } catch (err) {
    return sendError(res, err);
  }
}

function remove(req, res) {
  try {
    const property = propertyService.getById(req.params.id);
    if (!property) return res.status(404).json({ error: 'Property not found' });
    const index = Number(req.params.index);
    const documents = [...(property.documents || [])];
    if (!Number.isInteger(index) || index < 0 || index >= documents.length) {
      return res.status(404).json({ error: 'Document not found' });
    }
    const [removed] = documents.splice(index, 1);
    vault.removeStoredFile(removed?.url);
    return res.json({ property: propertyService.update(property.id, { documents }) });
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { seed, propertyFile, upload, remove };
