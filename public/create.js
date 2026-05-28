// Элементы формы
const selectTime = document.getElementById('time');
const inputInspector = document.getElementById('inspector');
const inputWorkplace = document.getElementById('workplace');
const errorInspector = document.getElementById('error-inspector');
const errorWorkplace = document.getElementById('error-workplace');
const btnCancel = document.getElementById('btn-cancel');
const form = document.getElementById('create-form');

// Загрузка вариантов времени проверки из конфига
async function loadTimes() {
  const res = await fetch('/api/config');
  const config = await res.json();
  selectTime.innerHTML = config.times.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Валидация ФИО — только буквы, точки и пробелы
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

// Валидация рабочего места — только цифры
function validateWorkplace() {
  const value = inputWorkplace.value.trim();
  const workplaceRegex = /^\d+$/;
  if (value === '') {
    errorWorkplace.textContent = '';
    return true;
  }
  if (!workplaceRegex.test(value)) {
    errorWorkplace.textContent = 'Только цифры';
    return false;
  }
  errorWorkplace.textContent = '';
  return true;
}

// Live-валидация при вводе
inputInspector.addEventListener('input', validateInspector);
inputWorkplace.addEventListener('input', validateWorkplace);

// Кнопка отмены — возврат на главный экран
btnCancel.addEventListener('click', () => {
  window.location.href = '/';
});

// Отправка формы создания табеля
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Финальная проверка перед отправкой
  const inspectorValid = validateInspector();
  const workplaceValid = validateWorkplace();

  if (!inspectorValid || !workplaceValid) return;

  const inspector = inputInspector.value.trim();
  const workplace = inputWorkplace.value.trim();

  const data = {
    time: selectTime.value,
    inspector: inspector,
    workplace: workplace
  };

  // Проверка на дубликат (время + рабочее место)
  const checkRes = await fetch('/api/timesheets/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time: data.time, workplace: data.workplace })
  });
  const checkResult = await checkRes.json();

  // Если дубликат найден — запрос на перезапись или отмену
  if (checkResult.duplicate) {
    if (checkResult.existingComplete) {
      const choice = confirm(
        `Табель для времени "${data.time}" и рабочего места "${data.workplace}" уже заполнен.\n\nЕго внёс: ${checkResult.existingInspector}\n\nНажмите "ОК", чтобы перезаписать, или "Отмена" для возврата.`
      );
      if (!choice) return;
      data.overwrite = checkResult.existingFile;
    } else {
      alert(
        `Невозможно создать новый табель.\n\nТабель для времени "${data.time}" и рабочего места "${data.workplace}" сейчас заполняется.\nЕго начал: ${checkResult.existingInspector}\n\nСначала удалите существующий табель из общего списка.`
      );
      return;
    }
  }

  // Создание табеля
  const res = await fetch('/api/timesheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const created = await res.json();
  window.location.href = `/edit.html?file=${encodeURIComponent(created.filename)}`;
});

// Загрузка списка времён при открытии страницы
loadTimes();