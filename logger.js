const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'log.json');

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '[]', 'utf-8');
}

function logAction(action, details = '') {
  const entry = {
    datetime: new Date().toISOString(),
    action: action,
    details: details
  };
  try {
    const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    log.push(entry);
    fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
  } catch (err) {
    console.error('Ошибка записи лога:', err.message);
  }
}

function rotateLog() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const log = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    if (log.length === 0) return;

    const lastEntry = log[log.length - 1];
    const lastDate = new Date(lastEntry.datetime);
    const now = new Date();

    if (lastDate.toDateString() !== now.toDateString()) {
      const dateSlug = `${lastDate.getFullYear()}_${String(lastDate.getMonth() + 1).padStart(2, '0')}_${String(lastDate.getDate()).padStart(2, '0')}`;
      const archiveName = path.join(LOG_DIR, `log_${dateSlug}.json`);
      fs.renameSync(LOG_FILE, archiveName);
      fs.writeFileSync(LOG_FILE, '[]', 'utf-8');
      console.log(`Лог за ${dateSlug} архивирован`);
    }
  } catch (err) {
    console.error('Ошибка ротации лога:', err.message);
  }
}

module.exports = { logAction, rotateLog, LOG_FILE };