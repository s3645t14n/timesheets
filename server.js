const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const LOG_DIR = path.join(__dirname, 'logs');

// Создаём папки, если их ещё нет
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR);
}
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR);
}

const LOG_FILE = path.join(LOG_DIR, 'log.json');

// Инициализация лога, если отсутствует
if (!fs.existsSync(LOG_FILE)) {
  fs.writeFileSync(LOG_FILE, '[]', 'utf-8');
}

// MIME-типы для отдачи статических файлов
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

// Загрузка конфига (критерии + времена проверки)
function loadConfig() {
  const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8');
  return JSON.parse(raw);
}

// Запись события в лог
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

// Преобразование русскоязычной строки в безопасный slug для имени файла
function makeSlug(str) {
  const months = {
    'января': 'jan', 'февраля': 'feb', 'марта': 'mar', 'апреля': 'apr',
    'мая': 'may', 'июня': 'jun', 'июля': 'jul', 'августа': 'aug',
    'сентября': 'sep', 'октября': 'oct', 'ноября': 'nov', 'декабря': 'dec'
  };
  const times = {
    'утро': 'morning',
    'вечер': 'evening',
    'день': 'day',
    'ночь': 'night'
  };

  let result = str.toLowerCase();

  // Транслитерация месяцев
  for (const [ru, en] of Object.entries(months)) {
    result = result.replace(ru, en);
  }

  // Транслитерация времени суток
  for (const [ru, en] of Object.entries(times)) {
    result = result.replace(ru, en);
  }

  // Удаляем всё, кроме латиницы, цифр и пробелов (защита от path traversal)
  result = result.replace(/[^a-z0-9 ]/g, '');
  // Пробелы и повторы пробелов — в одиночное подчёркивание
  result = result.replace(/ +/g, '_');
  // Убираем крайние подчёркивания
  result = result.replace(/^_|_$/g, '');
  return result;
}

// Проверка, заполнен ли табель полностью (все критерии имеют оценку)
function isComplete(timesheet, criteria) {
  if (!timesheet.scores || Object.keys(timesheet.scores).length === 0) return false;
  return criteria.every(crit => timesheet.scores.hasOwnProperty(crit.id));
}

// Получение списка активных табелей (без помеченных как удалённые)
function getActiveTimesheets() {
  const config = loadConfig();
  const files = fs.readdirSync(DATA_DIR);
  const result = [];
  for (const file of files) {
    if (file.endsWith('_deleted.json')) continue;
    if (!file.endsWith('.json')) continue;
    try {
      const filePath = path.join(DATA_DIR, file);
      const stat = fs.statSync(filePath);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      result.push({
        filename: file,
        created: stat.birthtime.toISOString(),
        modified: stat.mtime.toISOString(),
        complete: isComplete(data, config.criteria),
        ...data
      });
    } catch (err) {
      console.error(`Ошибка чтения табеля ${file}:`, err.message);
    }
  }
  // Сортировка от новых к старым (по убыванию даты создания)
  result.sort((a, b) => b.created.localeCompare(a.created));
  return result;
}

// Поиск дубликата по связке "время проверки + рабочее место"
function findDuplicate(time, workplace) {
  const timesheets = getActiveTimesheets();
  return timesheets.find(ts => ts.time === time && ts.workplace === workplace) || null;
}

// Чтение тела POST/PUT-запроса как JSON
function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        resolve({});
      }
    });
  });
}

// Отправка JSON-ответа
function sendJSON(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

// Отдача статического файла с подстановкой header и footer
function serveStatic(res, url) {
  const cleanUrl = url.split('?')[0];
  const filePath = path.join(PUBLIC_DIR, cleanUrl === '/' ? 'index.html' : cleanUrl);
  const ext = path.extname(filePath);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  // Подстановка header и footer для HTML-файлов
  if (ext === '.html') {
    const header = fs.existsSync(path.join(PUBLIC_DIR, 'header.html'))
      ? fs.readFileSync(path.join(PUBLIC_DIR, 'header.html'), 'utf-8')
      : '';
    const footer = fs.existsSync(path.join(PUBLIC_DIR, 'footer.html'))
      ? fs.readFileSync(path.join(PUBLIC_DIR, 'footer.html'), 'utf-8')
      : '';
    content = content.replace('<!--HEADER-->', header).replace('<!--FOOTER-->', footer);
  }

  res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
  res.end(content);
}

// Генерация HTML сводного отчёта для печати (только заполненные табели)
function generateReport() {
  const config = loadConfig();
  const allTimesheets = getActiveTimesheets();
  const timesheets = allTimesheets.filter(ts => ts.complete);

  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'не определён';
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const grouped = {};
  for (const time of config.times) {
    grouped[time] = [];
  }

  for (const ts of timesheets) {
    if (grouped[ts.time]) {
      grouped[ts.time].push(ts);
    }
  }

  let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Сводный отчёт</title>
<link rel="stylesheet" href="/print.css">
</head>
<body>
<h1>Сводный отчёт по табелям</h1>
<p class="report-date">Сформирован: ${dateStr} в ${timeStr} (${tz}) | <a href="/api/config" target="_blank">показать активный конфиг</a></p>`;

  for (const time of config.times) {
    const items = grouped[time];
    if (items.length === 0) continue;

    html += `<h2>${time}</h2>`;
    html += `<table><thead><tr><th>Рабочее место</th>`;

    for (const crit of config.criteria) {
      html += `<th>${crit.id}</th>`;
    }
    html += `</tr></thead><tbody>`;

    for (const item of items) {
      html += `<tr><td>${item.workplace} (${item.inspector})</td>`;
      for (const crit of config.criteria) {
        html += `<td>${item.scores[crit.id] ?? '-'}</td>`;
      }
      html += `</tr>`;
    }

    html += `</tbody></table>`;
  }

  html += `</body></html>`;
  return html;
}

// Генерация HTML лога операций для печати
function generateLog() {
  const now = new Date();
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'не определён';
  const dateStr = `${String(now.getDate()).padStart(2, '0')}.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`;
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  let logEntries = [];
  try {
    logEntries = JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
  } catch (err) {
    logEntries = [];
  }

  // Форматирование даты/времени для отображения
  function formatDT(iso) {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
  }

  // Ссылки на файлы табелей делаем кликабельными
  function makeLinks(text) {
    return text.replace(/\/api\/timesheets\/[^\s,]+/g, (match) => {
      return `<a href="${match}" target="_blank">${match}</a>`;
    });
  }

  let html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Лог операций</title>
<link rel="stylesheet" href="/print.css">
</head>
<body>
<h1>Лог операций</h1>
<p class="report-date">Сформирован: ${dateStr} в ${timeStr} (${tz})</p>
<table>
<thead><tr><th>Дата и время</th><th>Операция</th><th>Подробности</th></tr></thead>
<tbody>`;

  for (const entry of logEntries) {
    html += `<tr>
      <td>${formatDT(entry.datetime)}</td>
      <td>${entry.action}</td>
      <td>${makeLinks(entry.details || '-')}</td>
    </tr>`;
  }

  html += `</tbody></table></body></html>`;
  return html;
}

// Создание HTTP-сервера
const server = http.createServer(async (req, res) => {
  const url = req.url;
  const method = req.method;

  // --- API: проверка дубликата перед созданием ---
  if (url === '/api/timesheets/check-duplicate' && method === 'POST') {
    const body = await parseBody(req);
    const duplicate = findDuplicate(body.time, body.workplace);

    // Логирование попытки создания дубликата
    if (duplicate) {
      logAction(
        `Попытка создания дубликата (отклонено): ${body.time}, место ${body.workplace}`,
        `Существующий табель: /api/timesheets/${duplicate.filename}, проверяющий: ${duplicate.inspector}, заполнен: ${duplicate.complete ? 'да' : 'нет'}`
      );
    }

    return sendJSON(res, {
      duplicate: !!duplicate,
      existingFile: duplicate ? duplicate.filename : null,
      existingInspector: duplicate ? duplicate.inspector : null,
      existingComplete: duplicate ? duplicate.complete : null
    });
  }

  // --- API: список активных табелей ---
  if (url === '/api/timesheets' && method === 'GET') {
    return sendJSON(res, getActiveTimesheets());
  }

  // --- API: создание нового табеля ---
  if (url === '/api/timesheets' && method === 'POST') {
    const body = await parseBody(req);

    if (!body.time || !body.inspector || !body.workplace) {
      return sendJSON(res, { error: 'Заполните все поля' }, 400);
    }

    try {
      const slugTime = makeSlug(body.time);
      const slugPlace = makeSlug(body.workplace);
      const filename = `${slugTime}_${slugPlace}.json`;

      if (body.overwrite) {
        // Перезапись существующего табеля
        const oldPath = path.join(DATA_DIR, body.overwrite);
        if (fs.existsSync(oldPath)) {
          const newName = body.overwrite.replace('.json', '_deleted.json');
          fs.renameSync(oldPath, path.join(DATA_DIR, newName));
        }
        logAction(
          `Перезапись табеля: ${body.time}, место ${body.workplace}`,
          `Файл: /api/timesheets/${filename}, проверяющий: ${body.inspector}`
        );
      } else {
        logAction(
          `Создание табеля (незаполненный): ${body.time}, место ${body.workplace}`,
          `Файл: /api/timesheets/${filename}, проверяющий: ${body.inspector}`
        );
      }

      const data = {
        time: body.time,
        inspector: body.inspector,
        workplace: body.workplace,
        scores: {}
      };

      fs.writeFileSync(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
      return sendJSON(res, { filename, ...data }, 201);
    } catch (err) {
      console.error('Ошибка создания табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось создать табель' }, 500);
    }
  }

  // --- API: получение одного табеля ---
  if (url.startsWith('/api/timesheets/') && method === 'GET') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (!fs.existsSync(filePath)) {
        return sendJSON(res, { error: 'Not found' }, 404);
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return sendJSON(res, data);
    } catch (err) {
      console.error('Ошибка чтения табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось прочитать табель' }, 500);
    }
  }

  // --- API: сохранение оценок табеля (заполнение) ---
  if (url.startsWith('/api/timesheets/') && method === 'PUT') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (!fs.existsSync(filePath)) {
        return sendJSON(res, { error: 'Not found' }, 404);
      }
      const body = await parseBody(req);
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      existing.scores = body.scores;
      fs.writeFileSync(filePath, JSON.stringify(existing, null, 2));

      logAction(
        `Заполнение табеля: ${existing.time}, место ${existing.workplace}`,
        `Файл: /api/timesheets/${filename}, проверяющий: ${existing.inspector}`
      );

      return sendJSON(res, { ok: true });
    } catch (err) {
      console.error('Ошибка сохранения табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось сохранить табель' }, 500);
    }
  }

  // --- API: удаление табеля (пометка как неактивный) ---
  if (url.startsWith('/api/timesheets/') && method === 'DELETE') {
    const filename = url.replace('/api/timesheets/', '').split('?')[0];
    const filePath = path.join(DATA_DIR, filename);
    try {
      if (!fs.existsSync(filePath)) {
        return sendJSON(res, { error: 'Not found' }, 404);
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      const newName = filename.replace('.json', '_deleted.json');
      fs.renameSync(filePath, path.join(DATA_DIR, newName));

      logAction(
        `Удаление табеля: ${data.time}, место ${data.workplace}`,
        `Файл: /api/timesheets/${newName} (помечен удалённым), проверяющий: ${data.inspector}`
      );

      return sendJSON(res, { ok: true });
    } catch (err) {
      console.error('Ошибка удаления табеля:', err.message);
      return sendJSON(res, { error: 'Не удалось удалить табель' }, 500);
    }
  }

  // --- API: получение конфига ---
  if (url === '/api/config' && method === 'GET') {
    return sendJSON(res, loadConfig());
  }

  // --- API: сводный отчёт (HTML для печати) ---
  if (url === '/api/report' && method === 'GET') {
    const html = generateReport();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- API: лог операций (HTML для печати) ---
  if (url === '/api/log' && method === 'GET') {
    const html = generateLog();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(html);
  }

  // --- Статические файлы ---
  serveStatic(res, url);
});

// Запуск сервера
server.listen(PORT, () => {
  console.log(`Сервер запущен: http://localhost:${PORT}`);
});