// Экранирование HTML
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Элементы страницы
const metaEl = document.getElementById('meta');
const criteriaListEl = document.getElementById('criteria-list');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');

// Имя файла табеля из URL-параметра
const params = new URLSearchParams(window.location.search);
const filename = params.get('file');

// Данные, загруженные с сервера
let timesheetData = null;
let configData = null;

// Загрузка табеля и конфига с сервера
async function loadData() {
  try {
    const [tsRes, cfgRes] = await Promise.all([
      fetch(`/api/timesheets/${encodeURIComponent(filename)}`),
      fetch('/api/config')
    ]);
    timesheetData = await tsRes.json();
    configData = await cfgRes.json();
    render();
  } catch (err) {
    alert('Не удалось загрузить данные. Проверьте подключение к сети.');
  }
}

// Единая функция расчёта оценок, итога и процента
function calculateScores() {
  const scores = {};
  let totalScore = 0;

  configData.criteria.forEach(crit => {
    const checked = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]:checked`);
    if (checked) {
      const value = parseInt(checked.value);
      scores[crit.id] = value;
      totalScore += crit.maxScore * (value / 2);
    }
  });

  const maxTotal = configData.maxTotalScore || 75;
  const percent = maxTotal > 0 ? parseFloat(((totalScore / maxTotal) * 100).toFixed(1)) : 0;

  return { scores, totalScore, percent };
}

// Сохранение оценок, итога и процента на сервер
async function autoSave() {
  const { scores, totalScore, percent } = calculateScores();

  timesheetData.scores = scores;
  timesheetData.totalScore = totalScore;
  timesheetData.percent = percent;

  try {
    await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, totalScore, percent })
    });
  } catch (err) {
    // Молча игнорируем ошибку автосохранения
  }
}

// Отображение метаданных табеля
function renderMeta() {
  metaEl.innerHTML = `
    <div class="meta-row"><span class="meta-label">Время:</span> ${escapeHtml(timesheetData.time)}</div>
    <div class="meta-row"><span class="meta-label">Проверяющий:</span> ${escapeHtml(timesheetData.inspector)}</div>
    <div class="meta-row"><span class="meta-label">Рабочее место:</span> ${escapeHtml(timesheetData.workplace)}</div>
  `;
}

// Отображение списка критериев с радиокнопками
function renderCriteria() {
  criteriaListEl.innerHTML = configData.criteria.map(crit => {
    const savedValue = timesheetData.scores[crit.id];
    const options = crit.options || ['', '', ''];

    return `
      <div class="criterion">
        <div class="criterion-name">Критерий ${escapeHtml(crit.id)} <span class="max-score">(макс. ${crit.maxScore} балла)</span></div>
        <div class="criterion-desc">${escapeHtml(crit.description)}</div>
        <div class="radio-group">
          <div class="radio-option">
            <label>
              <input type="radio" name="crit_${escapeHtml(crit.id)}" value="0" ${savedValue === 0 ? 'checked' : ''}> 0
              <div class="option-desc">${escapeHtml(options[0])}</div>
            </label>
          </div>
          <div class="radio-option">
            <label>
              <input type="radio" name="crit_${escapeHtml(crit.id)}" value="1" ${savedValue === 1 ? 'checked' : ''}> 1
              <div class="option-desc">${escapeHtml(options[1])}</div>
            </label>
          </div>
          <div class="radio-option">
            <label>
              <input type="radio" name="crit_${escapeHtml(crit.id)}" value="2" ${savedValue === 2 ? 'checked' : ''}> 2
              <div class="option-desc">${escapeHtml(options[2])}</div>
            </label>
          </div>
        </div>
      </div>
    `;
  }).join('');

  criteriaListEl.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', async () => {
      checkAllScored();
      await autoSave();
    });
  });
}

// Проверка, все ли критерии оценены, подсветка и обновление итога
function checkAllScored() {
  const { totalScore, percent } = calculateScores();

  let allScored = true;
  configData.criteria.forEach(crit => {
    const radio = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]:checked`);
    const criterionEl = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]`)?.closest('.criterion');

    if (criterionEl) {
      if (radio) {
        criterionEl.classList.add('scored');
      } else {
        criterionEl.classList.remove('scored');
        allScored = false;
      }
    } else {
      allScored = false;
    }
  });

  btnSave.disabled = !allScored;

  const totalEl = document.getElementById('total-score');
  if (totalEl) {
    totalEl.textContent = `Итог: ${totalScore.toFixed(1)} (${percent}%)`;
  }
}

// Кнопка сохранения — финальное сохранение и возврат на главную
btnSave.addEventListener('click', async () => {
  const { scores, totalScore, percent } = calculateScores();

  try {
    const res = await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, totalScore, percent })
    });

    if (!res.ok) {
      alert('Этот табель был удалён другим пользователем. Сохранение невозможно.');
    }
  } catch (err) {
    alert('Ошибка сохранения. Проверьте подключение к сети.');
  }

  window.location.href = '/';
});

// Кнопка отмены — возврат на главную
btnCancel.addEventListener('click', () => {
  window.location.href = '/';
});

// Первичный рендер после загрузки данных
function render() {
  renderMeta();
  renderCriteria();
  checkAllScored();
}

async function initClock() {
  try {
    const res = await fetch('/api/server-time');
    const data = await res.json();
    const [datePart, timePart] = data.datetime.split(' ');
    const [day, month, year] = datePart.split('.');
    const [hours, minutes, seconds] = timePart.split(':');
    const serverTime = new Date(year, month - 1, day, hours, minutes, seconds);
    const offset = serverTime.getTime() - Date.now();

    function updateClock() {
      const now = new Date(Date.now() + offset);
      const d = String(now.getDate()).padStart(2, '0');
      const m = String(now.getMonth() + 1).padStart(2, '0');
      const y = now.getFullYear();
      const h = String(now.getHours()).padStart(2, '0');
      const min = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const el = document.getElementById('server-time');
      if (el) el.textContent = `${d}.${m}.${y} ${h}:${min}:${s} (${data.tz})`;
    }

    updateClock();
    setInterval(updateClock, 1000);
  } catch (err) {}
}

initClock();

// Загрузка данных при открытии страницы
loadData();