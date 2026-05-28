const fs = require('fs');
const path = require('path');
const { loadConfig } = require('./config');

const DATA_DIR = path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function makeSlug(str) {
  let result = String(str).toLowerCase();
  result = result.replace(/[^a-z0-9 ]/g, '');
  result = result.replace(/ +/g, '_');
  return result.replace(/^_|_$/g, '');
}

function getCurrentCheckTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const shift = now.getHours() < 18 ? '1 смена' : '2 смена';
  return {
    time: `${day} ${months[now.getMonth()]} ${shift}`,
    dateSlug: `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${day}`,
    shiftSlug: now.getHours() < 18 ? 'I' : 'II'
  };
}

function makeFilename(workplace) {
  const { dateSlug, shiftSlug } = getCurrentCheckTime();
  return `${dateSlug}_${shiftSlug}_${makeSlug(workplace)}.json`;
}

function getTimesheetPath(filename) {
  if (!/^[a-zA-Z0-9_.]+$/.test(filename)) return null;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) return null;
  const filePath = path.join(DATA_DIR, filename);
  const resolved = path.resolve(filePath);
  const resolvedDir = path.resolve(DATA_DIR);
  if (!resolved.startsWith(resolvedDir + path.sep) && resolved !== resolvedDir) return null;
  return filePath;
}

function isComplete(timesheet, criteria) {
  if (!timesheet.scores || Object.keys(timesheet.scores).length === 0) return false;
  return criteria.every(crit => timesheet.scores.hasOwnProperty(crit.id));
}

function getActiveTimesheets() {
  const config = loadConfig();
  const files = fs.readdirSync(DATA_DIR);
  const result = [];
  for (const file of files) {
    if (file.endsWith('_d.json')) continue;
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(DATA_DIR, file);
      const stat = fs.statSync(filePath);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      result.push({ filename: file, created: stat.birthtime.toISOString(), modified: stat.mtime.toISOString(), complete: isComplete(data, config.criteria), ...data });
    } catch (err) {
      console.error(`Ошибка чтения ${file}:`, err.message);
    }
  }
  result.sort((a, b) => b.created.localeCompare(a.created));
  return result;
}

function findDuplicate(time, workplace) {
  return getActiveTimesheets().find(ts => ts.time === time && ts.workplace === workplace) || null;
}

function getAllTimesheets() {
  const config = loadConfig();
  const files = fs.readdirSync(DATA_DIR);
  const result = [];
  for (const file of files) {
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(DATA_DIR, file);
      const stat = fs.statSync(filePath);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      result.push({
        filename: file,
        deleted: file.endsWith('_d.json'),
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        complete: file.endsWith('_d.json') ? true : isComplete(data, config.criteria),
        ...data
      });
    } catch (err) {
      console.error(`Ошибка чтения ${file}:`, err.message);
    }
  }
  result.sort((a, b) => b.created.localeCompare(a.created));
  return result;
}

function getTimesheetMatrix() {
  const config = loadConfig();
  const activeTimesheets = getActiveTimesheets();

  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const shifts = [
    { slug: 'II', label: '2 смена' },
    { slug: 'I', label: '1 смена' }
  ];

  const result = [];

  for (const dateStr of config.examDates) {
    if (dateStr > todayStr) continue;

    const isPast = dateStr < todayStr;
    const [year, month, day] = dateStr.split('-');
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dateDisplay = `${parseInt(day)} ${monthNames[parseInt(month) - 1]}`;

    for (const shift of shifts) {
      const timeLabel = `${dateDisplay} ${shift.label}`;
      const dateSlug = `${year}_${month}_${day}`;
      const workplaces = [];

      for (let w = 1; w <= config.maxWorkplaces; w++) {
        const filename = `${dateSlug}_${shift.slug}_${w}.json`;
        const existing = activeTimesheets.find(ts => ts.filename === filename);

        workplaces.push({
          workplace: String(w),
          timesheet: existing || null,
          exists: !!existing,
          complete: existing ? existing.complete : false,
          filename: filename,
          past: isPast
        });
      }

      result.push({
        date: dateStr,
        dateDisplay: dateDisplay,
        shift: shift.label,
        shiftSlug: shift.slug,
        timeLabel: timeLabel,
        past: isPast,
        workplaces: workplaces
      });
    }
  }

  return result;
}

function getUpcomingShifts() {
  const config = loadConfig();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const shifts = [
    { slug: 'II', label: '2 смена' },
    { slug: 'I', label: '1 смена' }
  ];

  const result = [];

  for (const dateStr of config.examDates) {
    if (dateStr <= todayStr) continue;

    const [year, month, day] = dateStr.split('-');
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dateDisplay = `${parseInt(day)} ${monthNames[parseInt(month) - 1]}`;

    for (const shift of shifts) {
      result.push({
        date: dateStr,
        label: `${dateDisplay}, ${shift.label}`
      });
    }
  }

  return result;
}

function getServerTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  return {
    datetime: `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`,
    tz: tz
  };
}

module.exports = { escapeHtml, makeSlug, getCurrentCheckTime, makeFilename, getTimesheetPath, isComplete, getActiveTimesheets, findDuplicate, getAllTimesheets, getTimesheetMatrix, getUpcomingShifts, getServerTime, DATA_DIR };