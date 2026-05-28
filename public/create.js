// Элементы формы
const inputInspector = document.getElementById('inspector');
const inputWorkplace = document.getElementById('workplace');
const errorInspector = document.getElementById('error-inspector');
const btnCancel = document.getElementById('btn-cancel');
const form = document.getElementById('create-form');

// Загрузка списка рабочих мест
async function loadWorkplaces() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    await updateWorkplaces(config);
  } catch (err) {
    alert('Не удалось загрузить список рабочих мест. Проверьте подключение к сети.');
  }
}

// Обновление списка рабочих мест с учётом занятых
async function updateWorkplaces(config) {
  try {
    const res = await fetch('/api/timesheets');
    const timesheets = await res.json();

    const occupied = {};
    for (const ts of timesheets) {
      occupied[ts.workplace] = ts.inspector;
    }

    const maxWorkplaces = config.maxWorkplaces || 14;
    inputWorkplace.innerHTML = '';
    for (let i = 1; i <= maxWorkplaces; i++) {
      const option = document.createElement('option');
      option.value = i;
      if (occupied[i]) {
        option.textContent = `${i} (заблокировано — ${occupied[i]})`;
        option.disabled = true;
      } else {
        option.textContent = i;
      }
      inputWorkplace.appendChild(option);
    }
  } catch (err) {
    // Молча — список останется без обновления
  }
}

// Валидация ФИО
function validateInspector() {
  const value = inputInspector.value.trim();
  const nameRegex = /^[a-zA-Zа-яА-ЯёЁ .]+$/;
  if (value === '') {
    errorInspector.textContent = '';
    return true;
  }
  if (!nameRegex.test(value)) {
    errorInspector.textContent = 'Только буквы, точки и пробелы';
    return false;
  }
  errorInspector.textContent = '';
  return true;
}

inputInspector.addEventListener('input', validateInspector);

btnCancel.addEventListener('click', () => {
  window.location.href = '/';
});

// Отправка формы
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const inspectorValid = validateInspector();
  if (!inspectorValid) return;

  const inspector = inputInspector.value.trim();
  const workplace = inputWorkplace.value;

  try {
    const res = await fetch('/api/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspector, workplace })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Не удалось создать табель');
      await updateWorkplaces();
      return;
    }

    const created = await res.json();
    window.location.href = `/edit.html?file=${encodeURIComponent(created.filename)}`;
  } catch (err) {
    alert('Ошибка создания табеля. Проверьте подключение к сети.');
  }
});

loadWorkplaces();