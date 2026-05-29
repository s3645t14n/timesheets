const fs = require('fs');
const path = require('path');
const { loadConfig, reloadConfig } = require('../config');
const { logAction, LOG_FILE } = require('../logger');
const { escapeHtml, getCurrentDateSlug, makeTimeLabel, makeFilename, getTimesheetPath, getActiveTimesheets, findDuplicate, getAllTimesheets, getTodayTimesheets, getPastShifts, getServerTime, DATA_DIR } = require('../timesheets');

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

function sendJSON(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function generateReportHTML(timeLabel, items, workplaces) {
  const config = loadConfig();
  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Ведомость</title><link rel="stylesheet" href="/print.css"></head><body><h1>${escapeHtml(timeLabel)}</h1><p class="report-date">Сформирован: ${dateStr} в ${timeStr} (${tz})</p>`;

  html += `<table><thead><tr><th>№</th><th>Код</th><th>Критерий / оцениваемые действия</th><th>Вес</th><th>Макс. балл</th>`;
  for (const wp of workplaces) {
    const item = items.find(ts => ts.workplace === wp);
    const label = item ? `М.${escapeHtml(wp)} (${escapeHtml(item.inspector)})` : `М.${escapeHtml(wp)}`;
    html += `<th>${label}</th>`;
  }
  html += `</tr></thead><tbody>`;

  for (let i = 0; i < config.criteria.length; i++) {
    const crit = config.criteria[i];
    html += `<tr><td>${i + 1}</td><td>${escapeHtml(crit.id)}</td><td>${escapeHtml(crit.description)}</td><td>${(crit.maxScore / 2).toFixed(1)}</td><td>${crit.maxScore}</td>`;
    for (const wp of workplaces) {
      const item = items.find(ts => ts.workplace === wp);
      html += `<td>${item && item.scores[crit.id] != null ? item.scores[crit.id] : '-'}</td>`;
    }
    html += `</tr>`;
  }

  html += `<tr class="total-row"><td colspan="3"><strong>ИТОГО</strong></td><td></td><td><strong>${config.maxTotalScore}</strong></td>`;
  for (const wp of workplaces) {
    const item = items.find(ts => ts.workplace === wp);
    html += `<td><strong>${item && item.totalScore != null ? item.totalScore.toFixed(1) : '—'}</strong></td>`;
  }
  html += `</tr>`;
  html += `<tr class="total-row"><td colspan="5">% от максимума</td>`;
  for (const wp of workplaces) {
    const item = items.find(ts => ts.workplace === wp);
    html += `<td>${item && item.percent != null ? item.percent + '%' : '—'}</td>`;
  }
  html += `</tr>`;
  html += `<tr class="total-row"><td colspan="5">ОЦЕНКА (5=90–100%, 4=65–89%, 3=50–64%, 2=0–49%)</td>`;
  for (const wp of workplaces) {
    const item = items.find(ts => ts.workplace === wp);
    let grade = '—';
    if (item && item.percent != null) {
      if (item.percent >= 90) grade = '5';
      else if (item.percent >= 65) grade = '4';
      else if (item.percent >= 50) grade = '3';
      else grade = '2';
    }
    html += `<td><strong>${grade}</strong></td>`;
  }
  html += `</tr></tbody></table></body></html>`;
  return html;
}

function generateLogHTML() {
  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let logEntries = [];
  try { logEntries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8')); } catch { logEntries = []; }

  function formatDT(iso) {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
  }

  function makeLinks(text) {
    return text.replace(/\/api\/timesheets\/[^\s,]+/g, m => `<a href="${m}" target="_blank">${m}</a>`);
  }

  let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Лог операций</title><link rel="stylesheet" href="/print.css"></head><body><h1>Лог операций</h1><p class="report-date">Сформирован: ${dateStr} в ${timeStr} (${tz}) | <a href="/api/config" target="_blank">Показать активный конфиг</a></p><table><thead><tr><th>Дата и время</th><th>Операция</th><th>Подробности</th></tr></thead><tbody>`;
  for (const entry of logEntries) {
    html += `<tr><td>${formatDT(entry.datetime)}</td><td>${escapeHtml(entry.action)}</td><td>${makeLinks(escapeHtml(entry.details || '-'))}</td></tr>`;
  }
  html += `</tbody></table></body></html>`;
  return html;
}

function getReportData(timeLabel, items, workplaces) {
  const config = loadConfig();
  const columns = ['Критерий', ...workplaces.map(w => `М.${w}`)];
  const rows = config.criteria.map(crit => {
    const row = [crit.id];
    for (const wp of workplaces) {
      const item = items.find(ts => ts.workplace === wp);
      row.push(item && item.scores[crit.id] != null ? item.scores[crit.id] : '');
    }
    return row;
  });
  return { title: timeLabel, columns, rows };
}

async function apiRouter(req, res) {
  const url = req.url;
  const method = req.method;

  if (url === '/api/timesheets/check-duplicate' && method === 'POST') {
    const body = await parseBody(req);
    const shiftSlug = body.shift === 'II' ? 'II' : 'I';
    const timeLabel = makeTimeLabel(shiftSlug);
    const duplicate = findDuplicate(timeLabel, body.workplace);
    if (duplicate) {
      logAction(`Попытка создания дубликата (отклонено): ${timeLabel}, место ${body.workplace}`, `Существующий табель: /api/timesheets/${duplicate.filename}, проверяющий: ${duplicate.inspector}`);
    }
    return sendJSON(res, { duplicate: !!duplicate, existingFile: duplicate ? duplicate.filename : null, existingInspector: duplicate ? duplicate.inspector : null, existingComplete: duplicate ? duplicate.complete : null });
  }

  if (url === '/api/timesheets/today' && method === 'GET') {
    return sendJSON(res, getTodayTimesheets());
  }

  if (url === '/api/timesheets/past' && method === 'GET') {
    return sendJSON(res, getPastShifts());
  }

  if (url === '/api/timesheets/all' && method === 'GET') {
    return sendJSON(res, getAllTimesheets());
  }

  if (url === '/api/timesheets' && method === 'GET') {
    return sendJSON(res, getActiveTimesheets());
  }

  if (url === '/api/timesheets' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.inspector || !body.workplace) return sendJSON(res, { error: 'Заполните все поля' }, 400);
    try {
      const shiftSlug = body.shift === 'II' ? 'II' : 'I';
      const timeLabel = makeTimeLabel(shiftSlug);
      const duplicate = findDuplicate(timeLabel, body.workplace);
      if (duplicate) return sendJSON(res, { error: `Рабочее место ${body.workplace} уже занято (${duplicate.inspector}). Обновите страницу.` }, 409);

      const filename = makeFilename(body.workplace, shiftSlug);
      logAction(`Создание табеля (незаполненный): ${timeLabel}, место ${body.workplace}`, `Файл: /api/timesheets/${filename}, проверяющий: ${body.inspector}`);

      const data = { time: timeLabel, inspector: body.inspector, workplace: body.workplace, scores: {}, totalScore: 0, percent: 0 };
      fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), { flag: 'wx' });
      return sendJSON(res, { filename, ...data }, 201);
    } catch (err) {
      if (err.code === 'EEXIST') return sendJSON(res, { error: 'Рабочее место уже занято. Обновите страницу.' }, 409);
      console.error('Ошибка создания табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось создать табель' }, 500);
    }
  }

  if (url.startsWith('/api/timesheets/') && !url.endsWith('/restore') && !url.endsWith('/all') && method === 'GET') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = getTimesheetPath(filename);
    if (!filePath) return sendJSON(res, { error: 'Недопустимое имя файла' }, 400);
    try {
      if (!fs.existsSync(filePath)) return sendJSON(res, { error: 'Not found' }, 404);
      return sendJSON(res, JSON.parse(fs.readFileSync(filePath, 'utf-8')));
    } catch (err) {
      return sendJSON(res, { error: 'Не удалось прочитать табель' }, 500);
    }
  }

  if (url.startsWith('/api/timesheets/') && method === 'PUT') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = getTimesheetPath(filename);
    if (!filePath) return sendJSON(res, { error: 'Недопустимое имя файла' }, 400);
    try {
      if (!fs.existsSync(filePath)) return sendJSON(res, { error: 'Not found' }, 404);
      const body = await parseBody(req);
      const criteria = loadConfig().criteria;
      for (const crit of criteria) {
        const val = body.scores[crit.id];
        if (val !== undefined && val !== 0 && val !== 1 && val !== 2) {
          return sendJSON(res, { error: `Недопустимое значение для критерия ${crit.id}: ${val}` }, 400);
        }
      }
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      existing.scores = body.scores;
      if (body.totalScore != null) existing.totalScore = body.totalScore;
      if (body.percent != null) existing.percent = body.percent;
      if (body.grade != null) existing.grade = body.grade;
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      return sendJSON(res, { ok: true });
    } catch (err) {
      return sendJSON(res, { error: 'Не удалось сохранить табель' }, 500);
    }
  }

  if (url.startsWith('/api/timesheets/') && method === 'DELETE') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = getTimesheetPath(filename);
    if (!filePath) return sendJSON(res, { error: 'Недопустимое имя файла' }, 400);
    try {
      if (!fs.existsSync(filePath)) return sendJSON(res, { error: 'Not found' }, 404);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const newName = filename.replace('.json', '_d.json');
      fs.renameSync(filePath, path.join(DATA_DIR, newName));
      logAction(`Удаление табеля: ${data.time}, место ${data.workplace}`, `Файл: /api/timesheets/${newName} (помечен удалённым), проверяющий: ${data.inspector}`);
      return sendJSON(res, { ok: true });
    } catch (err) {
      return sendJSON(res, { error: 'Не удалось удалить табель' }, 500);
    }
  }

  if (url.startsWith('/api/timesheets/') && url.endsWith('/restore') && method === 'POST') {
    const filename = url.replace('/api/timesheets/', '').replace('/restore', '').split('?')[0];
    const deletedPath = path.join(DATA_DIR, filename);
    const restoredName = filename.replace('_d.json', '.json');
    const restoredPath = path.join(DATA_DIR, restoredName);
    try {
      if (!fs.existsSync(deletedPath)) return sendJSON(res, { error: 'Not found' }, 404);
      fs.renameSync(deletedPath, restoredPath);
      logAction(`Восстановление табеля`, `Файл: /api/timesheets/${restoredName}`);
      return sendJSON(res, { ok: true });
    } catch (err) {
      return sendJSON(res, { error: 'Не удалось восстановить табель' }, 500);
    }
  }

  if (url === '/api/server-time' && method === 'GET') {
    return sendJSON(res, getServerTime());
  }

  if (url === '/api/config' && method === 'GET') {
    return sendJSON(res, loadConfig());
  }

  if (url === '/api/config/reload' && method === 'POST') {
    return sendJSON(res, { ok: true, config: reloadConfig() });
  }

  // --- ведомость: данные JSON для DataTables ---
  if (url.startsWith('/api/report/') && url.endsWith('/data') && method === 'GET') {
    const slug = url.replace('/api/report/', '').replace('/data', '').split('?')[0];
    const [year, month, day, shiftSlug] = slug.split('_');
    const dateSlug = `${year}_${month}_${day}`;
    const config = loadConfig();
    const allTimesheets = getActiveTimesheets();

    const shiftLabel = shiftSlug === 'I' ? '1 смена' : '2 смена';
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const timeLabel = `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${shiftLabel}`;

    const items = [];
    const workplaces = [];
    for (let w = 1; w <= config.maxWorkplaces; w++) {
      const filename = `${dateSlug}_${shiftSlug}_${w}.json`;
      const ts = allTimesheets.find(t => t.filename === filename);
      if (ts && ts.complete) {
        items.push(ts);
        workplaces.push(String(w));
      }
    }

    return sendJSON(res, getReportData(timeLabel, items, workplaces));
  }

  // --- ведомость: HTML для печати (общая или сменная) ---
  if (url.startsWith('/api/report/') && method === 'GET') {
    const slug = url.replace('/api/report/', '').split('?')[0];
    const [year, month, day, shiftSlug] = slug.split('_');
    const dateSlug = `${year}_${month}_${day}`;
    const config = loadConfig();
    const allTimesheets = getActiveTimesheets();

    const shiftLabel = shiftSlug === 'I' ? '1 смена' : '2 смена';
    const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    const timeLabel = `${parseInt(day)} ${monthNames[parseInt(month) - 1]} ${shiftLabel}`;

    const items = [];
    const workplaces = [];
    for (let w = 1; w <= config.maxWorkplaces; w++) {
      const filename = `${dateSlug}_${shiftSlug}_${w}.json`;
      const ts = allTimesheets.find(t => t.filename === filename);
      if (ts && ts.complete) {
        items.push(ts);
        workplaces.push(String(w));
      }
    }

    const html = generateReportHTML(timeLabel, items, workplaces);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- сводный отчёт (все смены) ---
  if (url === '/api/report' && method === 'GET') {
    const config = loadConfig();
    const allTimesheets = getActiveTimesheets();
    const timesheets = allTimesheets.filter(ts => ts.complete);
    timesheets.sort((a, b) => parseInt(a.workplace) - parseInt(b.workplace));

    const grouped = {};
    for (const ts of timesheets) {
      if (!grouped[ts.time]) grouped[ts.time] = [];
      grouped[ts.time].push(ts);
    }

    let html = '';
    for (const time of Object.keys(grouped).sort()) {
      const items = grouped[time];
      const workplaces = [...new Set(items.map(ts => ts.workplace))];
      html += generateReportHTML(time, items, workplaces);
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- общая ведомость: данные JSON для DataTables ---
  if (url === '/api/report/data' && method === 'GET') {
    const config = loadConfig();
    const allTimesheets = getActiveTimesheets();
    const timesheets = allTimesheets.filter(ts => ts.complete);
    timesheets.sort((a, b) => parseInt(a.workplace) - parseInt(b.workplace));

    const workplaces = [...new Set(timesheets.map(ts => ts.workplace))];
    return sendJSON(res, getReportData('Сводная ведомость', timesheets, workplaces));
  }

  if (url === '/api/log' && method === 'GET') {
    const html = generateLogHTML();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  res.writeHead(404);
  res.end('API Not found');
}

module.exports = apiRouter;