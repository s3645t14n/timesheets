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

function getCurrentDateSlug() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  return {
    dateDisplay: `${day} ${months[now.getMonth()]}`,
    dateSlug: `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}_${day}`
  };
}

function makeTimeLabel(shiftSlug) {
  const { dateDisplay } = getCurrentDateSlug();
  const shiftLabel = shiftSlug === 'II' ? '2 смена' : '1 смена';
  return `${dateDisplay} ${shiftLabel}`;
}

function makeFilename(workplace, shiftSlug) {
  const { dateSlug } = getCurrentDateSlug();
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

function getTodayTimesheets() {
  const config = loadConfig();
  const allActive = getActiveTimesheets();
  const { dateSlug, dateDisplay } = getCurrentDateSlug();

  const shifts = [];
  const shiftsPerDay = config.shiftsPerDay || 2;
  if (shiftsPerDay >= 1) shifts.push({ slug: 'I', label: '1 смена' });
  if (shiftsPerDay >= 2) shifts.push({ slug: 'II', label: '2 смена' });

  const result = [];

  for (const shift of shifts) {
    const timeLabel = `${dateDisplay} ${shift.label}`;
    const workplaces = [];

    for (let w = 1; w <= config.maxWorkplaces; w++) {
      const filename = `${dateSlug}_${shift.slug}_${w}.json`;
      const existing = allActive.find(ts => ts.filename === filename);

      workplaces.push({
        workplace: String(w),
        timesheet: existing || null,
        exists: !!existing,
        complete: existing ? existing.complete : false,
        filename: filename
      });
    }

    result.push({
      shift: shift.label,
      shiftSlug: shift.slug,
      timeLabel: timeLabel,
      dateSlug: dateSlug,
      workplaces: workplaces
    });
  }

  return result;
}

function getPastShifts() {
  const config = loadConfig();
  const allTimesheets = getAllTimesheets();
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const pastMap = {};

  for (const ts of allTimesheets) {
    if (ts.deleted) continue;
    const match = ts.filename.match(/^(\d{4}_\d{2}_\d{2})_(I|II)_/);
    if (!match) continue;

    const fileDate = match[1].replace(/_/g, '-');
    if (fileDate >= todayStr) continue;

    const shiftSlug = match[2];
    const shiftLabel = shiftSlug === 'I' ? '1 смена' : '2 смена';

    const [year, month, day] = fileDate.split('-');
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const dateDisplay = `${parseInt(day)} ${monthNames[parseInt(month) - 1]}`;
    const key = `${fileDate}_${shiftSlug}`;
    const dateSlug = `${year}_${month}_${day}`;

    if (!pastMap[key]) {
      pastMap[key] = {
        date: fileDate,
        shift: shiftLabel,
        shiftSlug: shiftSlug,
        timeLabel: `${dateDisplay} ${shiftLabel}`,
        slug: `${dateSlug}_${shiftSlug}`,
        dateSlug: dateSlug,
        workplaces: []
      };
    }

    const wp = ts.workplace;
    if (!pastMap[key].workplaces.find(w => w.workplace === wp)) {
      pastMap[key].workplaces.push({
        workplace: wp,
        timesheet: ts,
        exists: true,
        complete: ts.complete
      });
    }
  }

  for (const key of Object.keys(pastMap)) {
    const shift = pastMap[key];
    for (let w = 1; w <= config.maxWorkplaces; w++) {
      if (!shift.workplaces.find(wp => wp.workplace === String(w))) {
        shift.workplaces.push({
          workplace: String(w),
          timesheet: null,
          exists: false,
          complete: false
        });
      }
    }
    shift.workplaces.sort((a, b) => parseInt(a.workplace) - parseInt(b.workplace));
  }

  return Object.values(pastMap).sort((a, b) => b.date.localeCompare(a.date));
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
  return { datetime: `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`, tz: tz };
}

module.exports = { escapeHtml, makeSlug, getCurrentDateSlug, makeTimeLabel, makeFilename, getTimesheetPath, isComplete, getActiveTimesheets, findDuplicate, getAllTimesheets, getTodayTimesheets, getPastShifts, getServerTime, DATA_DIR };