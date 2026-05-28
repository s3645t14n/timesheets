const fs = require('fs');
const path = require('path');
const { loadConfig, reloadConfig } = require('../config');
const { logAction, LOG_FILE } = require('../logger');
const { escapeHtml, getCurrentCheckTime, makeFilename, getTimesheetPath, getActiveTimesheets, findDuplicate, getAllTimesheets, DATA_DIR } = require('../timesheets');

// Чтение тела запроса как JSON
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// Отправка JSON-ответа
function sendJSON(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Генерация HTML сводного отчёта
function generateReport() {
  const config = loadConfig();
  const allTimesheets = getActiveTimesheets();
  const timesheets = allTimesheets.filter(ts => ts.complete);
  timesheets.sort((a, b) => parseInt(a.workplace) - parseInt(b.workplace));

  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const grouped = {};
  for (const ts of timesheets) {
    if (!grouped[ts.time]) grouped[ts.time] = [];
    grouped[ts.time].push(ts);
  }

  const workplaces = [...new Set(timesheets.map(ts => ts.workplace))];

  let html = `<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><title>Сводный отчёт</title><link rel="stylesheet" href="/print.css"></head><body><h1>Сводный отчёт по табелям</h1><p class="report-date">Сформирован: ${dateStr} в ${timeStr} (${tz})</p>`;

  for (const time of Object.keys(grouped).sort()) {
    const items = grouped[time];
    if (items.length === 0) continue;

    html += `<h2>${escapeHtml(time)}</h2><table><thead><tr><th>№</th><th>Код</th><th>Критерий / оцениваемые действия</th><th>Вес</th><th>Макс. балл</th>`;

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

    // ИТОГО
    html += `<tr class="total-row"><td colspan="3"><strong>ИТОГО</strong></td><td></td><td><strong>${config.maxTotalScore}</strong></td>`;
    for (const wp of workplaces) {
      const item = items.find(ts => ts.workplace === wp);
      html += `<td><strong>${item && item.totalScore != null ? item.totalScore.toFixed(1) : '—'}</strong></td>`;
    }
    html += `</tr>`;

    // % от максимума
    html += `<tr class="total-row"><td colspan="5">% от максимума</td>`;
    for (const wp of workplaces) {
      const item = items.find(ts => ts.workplace === wp);
      html += `<td>${item && item.percent != null ? item.percent + '%' : '—'}</td>`;
    }
    html += `</tr>`;

    // ОЦЕНКА
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
    html += `</tr></tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

// Генерация HTML лога операций
function generateLog() {
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

// Главный роутер API
async function apiRouter(req, res) {
  const url = req.url;
  const method = req.method;

  // --- проверка дубликата ---
  if (url === '/api/timesheets/check-duplicate' && method === 'POST') {
    const body = await parseBody(req);
    const checkTime = getCurrentCheckTime();
    const duplicate = findDuplicate(checkTime.time, body.workplace);
    if (duplicate) {
      logAction(`Попытка создания дубликата (отклонено): ${checkTime.time}, место ${body.workplace}`, `Существующий табель: /api/timesheets/${duplicate.filename}, проверяющий: ${duplicate.inspector}, заполнен: ${duplicate.complete ? 'да' : 'нет'}`);
    }
    return sendJSON(res, { duplicate: !!duplicate, existingFile: duplicate ? duplicate.filename : null, existingInspector: duplicate ? duplicate.inspector : null, existingComplete: duplicate ? duplicate.complete : null });
  }

  // --- все табели (включая удалённые) ---
  if (url === '/api/timesheets/all' && method === 'GET') {
    return sendJSON(res, getAllTimesheets());
  }

  // --- список активных табелей ---
  if (url === '/api/timesheets' && method === 'GET') {
    return sendJSON(res, getActiveTimesheets());
  }

  // --- создание табеля ---
  if (url === '/api/timesheets' && method === 'POST') {
    const body = await parseBody(req);
    if (!body.inspector || !body.workplace) return sendJSON(res, { error: 'Заполните все поля' }, 400);
    try {
      const checkTime = getCurrentCheckTime();
      const duplicate = findDuplicate(checkTime.time, body.workplace);
      if (duplicate) return sendJSON(res, { error: `Рабочее место ${body.workplace} уже занято (${duplicate.inspector}). Обновите страницу.` }, 409);

      const filename = makeFilename(body.workplace);
      logAction(`Создание табеля (незаполненный): ${checkTime.time}, место ${body.workplace}`, `Файл: /api/timesheets/${filename}, проверяющий: ${body.inspector}`);

      const data = { time: checkTime.time, inspector: body.inspector, workplace: body.workplace, scores: {}, totalScore: 0, percent: 0 };
      fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2), { flag: 'wx' });
      return sendJSON(res, { filename, ...data }, 201);
    } catch (err) {
      if (err.code === 'EEXIST') return sendJSON(res, { error: 'Рабочее место уже занято. Обновите страницу.' }, 409);
      console.error('Ошибка создания табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось создать табель' }, 500);
    }
  }

  // --- получение одного табеля ---
  if (url.startsWith('/api/timesheets/') && url !== '/api/timesheets/all' && method === 'GET') {
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

  // --- сохранение оценок ---
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
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));
      return sendJSON(res, { ok: true });
    } catch (err) {
      return sendJSON(res, { error: 'Не удалось сохранить табель' }, 500);
    }
  }

  // --- удаление табеля ---
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

  // --- конфиг ---
  if (url === '/api/config' && method === 'GET') {
    return sendJSON(res, loadConfig());
  }

  // --- перезагрузка конфига ---
  if (url === '/api/config/reload' && method === 'POST') {
    return sendJSON(res, { ok: true, config: reloadConfig() });
  }

  // --- сводный отчёт ---
  if (url === '/api/report' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(generateReport());
  }

  // --- лог ---
  if (url === '/api/log' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(generateLog());
  }

  // 404 для неизвестных API-роутов
  res.writeHead(404);
  res.end('API Not found');
}

module.exports = apiRouter;