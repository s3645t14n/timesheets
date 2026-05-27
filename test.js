// Скрипт для автоматического создания и заполнения табелей
// Запуск: node test.js

const BASE_URL = 'http://localhost:3000';

// Случайные данные
const inspectors = [
  'Иванов Иван Иванович',
  'Петров Пётр Петрович',
  'Сидорова Анна Сергеевна',
  'Козлов Дмитрий Андреевич',
  'Морозова Елена Викторовна',
  'Николаев Сергей Павлович',
  'Фёдорова Ольга Игоревна',
  'Васильев Алексей Михайлович'
];

// Загружаем конфиг с сервера, чтобы узнать времена и критерии
async function getConfig() {
  const res = await fetch(`${BASE_URL}/api/config`);
  return await res.json();
}

// Проверка дубликата (как живой пользователь)
async function checkDuplicate(time, workplace) {
  const res = await fetch(`${BASE_URL}/api/timesheets/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time, workplace })
  });
  return await res.json();
}

// Создание табеля
async function createTimesheet(time, inspector, workplace, overwrite = null) {
  const body = { time, inspector, workplace };
  if (overwrite) {
    body.overwrite = overwrite;
  }
  const res = await fetch(`${BASE_URL}/api/timesheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return await res.json();
}

// Сохранение оценок
async function saveScores(filename, scores) {
  await fetch(`${BASE_URL}/api/timesheets/${filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores })
  });
}

// Случайный выбор из массива
function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Случайный балл 0, 1 или 2
function randomScore() {
  return Math.floor(Math.random() * 3);
}

// Основной цикл
async function main() {
  const config = await getConfig();

  console.log('Начинаю тестирование...');
  console.log(`Времён проверки: ${config.times.length}`);
  console.log(`Критериев: ${config.criteria.length}`);
  console.log('Создаю табель каждые 2 секунды...\n');

  let count = 0;

  const createAndFill = async () => {
    const time = randomItem(config.times);
    const inspector = randomItem(inspectors);
    const workplace = String(Math.floor(Math.random() * 20) + 1);

    try {
      // Проверяем дубликат (как живой пользователь в create.js)
      const check = await checkDuplicate(time, workplace);

      let ts;

      if (check.duplicate) {
        if (check.existingComplete) {
          // Табель уже заполнен — перезаписываем (как пользователь нажал "ОК")
          console.log(`[${new Date().toLocaleTimeString()}] Найден заполненный дубликат: ${time}, место ${workplace} (${check.existingInspector}). Перезаписываю...`);
          ts = await createTimesheet(time, inspector, workplace, check.existingFile);
        } else {
          // Табель не заполнен — пропускаем (как пользователь получил alert и отменил)
          console.log(`[${new Date().toLocaleTimeString()}] Пропущен (заполняется): ${time}, место ${workplace} (начал ${check.existingInspector})`);
          return;
        }
      } else {
        // Новый табель
        ts = await createTimesheet(time, inspector, workplace);
        console.log(`[${new Date().toLocaleTimeString()}] Создан: ${time}, место ${workplace} (${inspector})`);
      }

      // Заполняем случайными баллами
      const scores = {};
      for (const crit of config.criteria) {
        scores[crit.id] = randomScore();
      }

      await saveScores(ts.filename, scores);
      console.log(`[${new Date().toLocaleTimeString()}] Заполнен: ${ts.filename}`);
      count++;
      console.log(`  Всего создано: ${count}\n`);
    } catch (err) {
      console.error(`  Ошибка: ${err.message}\n`);
    }
  };

  // Первый табель сразу
  await createAndFill();

  // Остальные по таймеру
  setInterval(createAndFill, 2000);
}

main();