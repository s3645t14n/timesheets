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

async function createTimesheet(inspector, workplace) {
  const res = await fetch(`${BASE_URL}/api/timesheets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspector, workplace })
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Ошибка создания');
  }
  return await res.json();
}

async function saveScores(filename, scores, totalScore, percent) {
  await fetch(`${BASE_URL}/api/timesheets/${filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores, totalScore, percent })
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
  console.log(`Критериев: ${config.criteria.length}`);
  console.log(`Макс. рабочих мест: ${config.maxWorkplaces}`);
  console.log(`Макс. итог: ${config.maxTotalScore}`);
  console.log('Создаю табель каждые 2 секунды...\n');

  let count = 0;

  const createAndFill = async () => {
    const inspector = randomItem(inspectors);
    const workplace = String(Math.floor(Math.random() * config.maxWorkplaces) + 1);

    try {
      const ts = await createTimesheet(inspector, workplace);
      console.log(`[${new Date().toLocaleTimeString()}] Создан: место ${workplace} (${inspector})`);

      const scores = {};
      let totalScore = 0;
      for (const crit of config.criteria) {
        const value = randomScore();
        scores[crit.id] = value;
        totalScore += crit.maxScore * (value / 2);
      }

      const maxTotal = config.maxTotalScore || 75;
      const percent = maxTotal > 0 ? parseFloat(((totalScore / maxTotal) * 100).toFixed(1)) : 0;

      await saveScores(ts.filename, scores, totalScore, percent);
      console.log(`[${new Date().toLocaleTimeString()}] Заполнен: ${ts.filename}, итог: ${totalScore.toFixed(1)} (${percent}%)`);
      count++;
      console.log(`  Всего создано: ${count}\n`);
    } catch (err) {
      console.log(`[${new Date().toLocaleTimeString()}] Пропущено место ${workplace}: ${err.message}\n`);
    }
  };

  await createAndFill();
  setInterval(createAndFill, 2000);
}

main();