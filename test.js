// Скрипт для автоматического создания и заполнения табелей
// Запуск: node test.js

const BASE_URL = 'http://localhost:3000';

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

async function getConfig() {
  const res = await fetch(`${BASE_URL}/api/config`);
  return await res.json();
}

async function checkDuplicate(time, workplace) {
  const res = await fetch(`${BASE_URL}/api/timesheets/check-duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time, workplace })
  });
  return await res.json();
}

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

async function saveScores(filename, scores, totalScore) {
  await fetch(`${BASE_URL}/api/timesheets/${filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores, totalScore })
  });
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomScore() {
  return Math.floor(Math.random() * 3);
}

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
      const check = await checkDuplicate(time, workplace);
      let ts;

      if (check.duplicate) {
        if (check.existingComplete) {
          console.log(`[${new Date().toLocaleTimeString()}] Найден заполненный дубликат: ${time}, место ${workplace} (${check.existingInspector}). Перезаписываю...`);
          ts = await createTimesheet(time, inspector, workplace, check.existingFile);
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] Пропущен (заполняется): ${time}, место ${workplace} (начал ${check.existingInspector})`);
          return;
        }
      } else {
        ts = await createTimesheet(time, inspector, workplace);
        console.log(`[${new Date().toLocaleTimeString()}] Создан: ${time}, место ${workplace} (${inspector})`);
      }

      // Генерируем случайные оценки и считаем итог
      const scores = {};
      let totalScore = 0;
      for (const crit of config.criteria) {
        const value = randomScore();
        scores[crit.id] = value;
        totalScore += crit.maxScore * (value / 2);
      }

      await saveScores(ts.filename, scores, totalScore);
      console.log(`[${new Date().toLocaleTimeString()}] Заполнен: ${ts.filename}, итог: ${totalScore.toFixed(1)}`);
      count++;
      console.log(`  Всего создано: ${count}\n`);
    } catch (err) {
      console.error(`  Ошибка: ${err.message}\n`);
    }
  };

  await createAndFill();
  setInterval(createAndFill, 2000);
}

main();