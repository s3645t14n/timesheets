const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

function serveStatic(res, url) {
  const cleanUrl = url.split('?')[0];
  if (cleanUrl.includes('..') || cleanUrl.includes('~') || cleanUrl.includes('\\')) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  let filePath = path.join(PUBLIC_DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);
  filePath = path.resolve(filePath);
  const resolvedPublic = path.resolve(PUBLIC_DIR);

  if (!filePath.startsWith(resolvedPublic + path.sep) && filePath !== resolvedPublic) {
    res.writeHead(403); res.end('Forbidden'); return;
  }

  const ext = path.extname(filePath);
  if (!fs.existsSync(filePath)) {
    res.writeHead(404); res.end('Not found'); return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (ext === '.html') {
    const header = fs.existsSync(path.join(PUBLIC_DIR, 'header.html')) ? fs.readFileSync(path.join(PUBLIC_DIR, 'header.html'), 'utf-8') : '';
    const footer = fs.existsSync(path.join(PUBLIC_DIR, 'footer.html')) ? fs.readFileSync(path.join(PUBLIC_DIR, 'footer.html'), 'utf-8') : '';
    content = content.replace('<!--HEADER-->', header).replace('<!--FOOTER-->', footer);
  }

  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  res.end(content);
}

module.exports = { serveStatic };