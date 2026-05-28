// Элементы формы
const selectTime = document.getElementById('time');
const inputInspector = document.getElementById('inspector');
const inputWorkplace = document.getElementById('workplace');
const btnCancel = document.getElementById('btn-cancel');
const form = document.getElementById('create-form');

// Загрузка вариантов времени проверки из конфига
async function loadTimes() {
  const res = await fetch('/api/config');
  const config = await res.json();
  selectTime.innerHTML = config.times.map(t => `<option value="${t}">${t}</option>`).join('');
}

// Кнопка отмены — возврат на главный экран
btnCancel.addEventListener('click', () => {
  window.location.href = '/';
});

// Отправка формы создания табеля
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const inspector = inputInspector.value.trim();
  const workplace = inputWorkplace.value.trim();

  // Валидация ФИО — только буквы (русские и латинские), точки, пробелы
  const nameRegex = /^[a-zA-Zа-яА-ЯёЁ .]+$/;
  if (!nameRegex.test(inspector)) {
    alert('ФИО может содержать только буквы, точки и пробелы.');
    inputInspector.focus();
    return;
  }

  // Валидация номера рабочего места — только цифры
  const workplaceRegex = /^\d+$/;
  if (!workplaceRegex.test(workplace)) {
    alert('Номер рабочего места может содержать только цифры.');
    inputWorkplace.focus();
    return;
  }

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