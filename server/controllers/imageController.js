const path = require('path');
const images = require('../services/imageService');

function sendError(res, err) {
  const status = err.status || 500;
  if (status >= 500) console.error('Image error:', err);
  return res.status(status).json({ error: err.message || 'Request failed' });
}

function sendImage(res, filePath) {
  if (!filePath) return res.status(404).json({ error: 'Image not found' });
  res.set('Cache-Control', 'public, max-age=86400');
  return res.sendFile(path.resolve(filePath));
}

function seed(req, res) {
  return sendImage(res, images.seedPath(req.params.file));
}

function file(req, res) {
  return sendImage(res, images.uploadPath(req.params.file));
}

async function upload(req, res) {
  try {
    const sourceUrl = String(req.body?.sourceUrl || '').trim();
    if (sourceUrl) {
      return res.status(201).json(await images.ingestRemote(sourceUrl));
    }
    const filename = String(req.body?.filename || 'image.jpg');
    const stored = images.saveBuffer(images.decodeUpload(req.body?.data), filename);
    return res.status(201).json(stored);
  } catch (err) {
    return sendError(res, err);
  }
}

module.exports = { seed, file, upload };
