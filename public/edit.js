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
  const [tsRes, cfgRes] = await Promise.all([
    fetch(`/api/timesheets/${encodeURIComponent(filename)}`),
    fetch('/api/config')
  ]);
  timesheetData = await tsRes.json();
  configData = await cfgRes.json();
  render();
}

// Отображение метаданных табеля (время, ФИО, рабочее место)
function renderMeta() {
  metaEl.innerHTML = `
    <div class="meta-row"><span class="meta-label">Время:</span> ${timesheetData.time}</div>
    <div class="meta-row"><span class="meta-label">Проверяющий:</span> ${timesheetData.inspector}</div>
    <div class="meta-row"><span class="meta-label">Рабочее место:</span> ${timesheetData.workplace}</div>
  `;
}

// Отображение списка критериев с радиокнопками (0, 1, 2)
function renderCriteria() {
  criteriaListEl.innerHTML = configData.criteria.map(crit => {
    const savedValue = timesheetData.scores[crit.id];
    const options = crit.options || ['', '', ''];

    return `
      <div class="criterion">
        <div class="criterion-name">Критерий ${crit.id} <span class="max-score">(макс. ${crit.maxScore} балла)</span></div>
        <div class="criterion-desc">${crit.description}</div>
        <div class="radio-group">
          <div class="radio-option">
            <label><input type="radio" name="crit_${crit.id}" value="0" ${savedValue === 0 ? 'checked' : ''}> 0</label>
            <div class="option-desc">${options[0]}</div>
          </div>
          <div class="radio-option">
            <label><input type="radio" name="crit_${crit.id}" value="1" ${savedValue === 1 ? 'checked' : ''}> 1</label>
            <div class="option-desc">${options[1]}</div>
          </div>
          <div class="radio-option">
            <label><input type="radio" name="crit_${crit.id}" value="2" ${savedValue === 2 ? 'checked' : ''}> 2</label>
            <div class="option-desc">${options[2]}</div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  criteriaListEl.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', checkAllScored);
  });
}

// Проверка, все ли критерии оценены, подсветка и расчёт итогового балла
function checkAllScored() {
  let allScored = true;
  let totalScore = 0;

  configData.criteria.forEach(crit => {
    const radio = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]:checked`);
    const criterionEl = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]`)?.closest('.criterion');

    if (criterionEl) {
      if (radio) {
        criterionEl.classList.add('scored');
        const multiplier = parseInt(radio.value) / 2;
        totalScore += crit.maxScore * multiplier;
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
    totalEl.textContent = `Итог: ${totalScore.toFixed(1)}`;
  }
}

// Сохранение оценок на сервер
btnSave.addEventListener('click', async () => {
  const scores = {};
  let totalScore = 0;

  configData.criteria.forEach(crit => {
    const checked = criteriaListEl.querySelector(`input[name="crit_${crit.id}"]:checked`);
    const value = parseInt(checked.value);
    scores[crit.id] = value;
    totalScore += crit.maxScore * (value / 2);
  });

  const res = await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scores, totalScore })
  });

  if (!res.ok) {
    alert('Этот табель был удалён другим пользователем. Сохранение невозможно.');
    window.location.href = '/';
    return;
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

// Загрузка данных при открытии страницы
loadData();