function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const metaEl = document.getElementById('meta');
const criteriaListEl = document.getElementById('criteria-list');
const btnSave = document.getElementById('btn-save');
const btnCancel = document.getElementById('btn-cancel');
const params = new URLSearchParams(window.location.search);
const filename = params.get('file');

let timesheetData = null;
let configData = null;

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
    alert('Не удалось загрузить данные.');
  }
}

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

  let grade = '—';
  if (configData.gradeScale && percent > 0) {
    for (const g of configData.gradeScale) {
      if (percent >= g.min && percent <= g.max) {
        grade = g.grade;
        break;
      }
    }
  }

  return { scores, totalScore, percent, grade };
}

async function autoSave() {
  const { scores, totalScore, percent, grade } = calculateScores();
  timesheetData.scores = scores;
  timesheetData.totalScore = totalScore;
  timesheetData.percent = percent;
  timesheetData.grade = grade;

  try {
    await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, totalScore, percent, grade })
    });
  } catch (err) {}
}

function renderMeta() {
  metaEl.innerHTML = `
    <div class="meta-row"><span class="meta-label">Время:</span> ${escapeHtml(timesheetData.time)}</div>
    <div class="meta-row"><span class="meta-label">Проверяющий:</span> ${escapeHtml(timesheetData.inspector)}</div>
    <div class="meta-row"><span class="meta-label">Рабочее место:</span> ${escapeHtml(timesheetData.workplace)}</div>
  `;
}

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

function checkAllScored() {
  const { totalScore, percent, grade } = calculateScores();

  let allScored = true;
  configData.criteria.forEach(crit => {
    const radio = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]:checked`);
    const criterionEl = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]`)?.closest('.criterion');
    if (criterionEl) {
      if (radio) criterionEl.classList.add('scored');
      else { criterionEl.classList.remove('scored'); allScored = false; }
    } else { allScored = false; }
  });

  btnSave.disabled = !allScored;

  const totalEl = document.getElementById('total-score');
  if (totalEl) {
    totalEl.textContent = `Итог: ${totalScore.toFixed(1)} (${percent}%) Оценка: ${grade}`;
  }
}

btnSave.addEventListener('click', async () => {
  const { scores, totalScore, percent, grade } = calculateScores();

  try {
    const res = await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scores, totalScore, percent, grade })
    });
    if (!res.ok) alert('Табель был удалён. Сохранение невозможно.');
  } catch (err) {
    alert('Ошибка сохранения.');
  }

  window.location.href = '/';
});

btnCancel.addEventListener('click', () => { window.location.href = '/'; });

function render() { renderMeta(); renderCriteria(); checkAllScored(); }

// Часы
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
loadData();