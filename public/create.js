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

  const data = {
    time: selectTime.value,
    inspector: inputInspector.value.trim(),
    workplace: inputWorkplace.value.trim()
  };

  // Проверка на дубликат (время + рабочее место)
  const checkRes = await fetch('/api/timesheets/check-duplicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ time: data.time, workplace: data.workplace })
  });
  const checkResult = await checkRes.json();

  // Дубликат найден
  if (checkResult.duplicate) {
    // Заполненный табель — предлагаем перезаписать
    if (checkResult.existingComplete) {
      const choice = confirm(
        `Табель для времени "${data.time}" и рабочего места "${data.workplace}" уже заполнен.\n\nЕго внёс: ${checkResult.existingInspector}\n\nНажмите "ОК", чтобы перезаписать, или "Отмена" для возврата.`
      );
      if (!choice) return;
      data.overwrite = checkResult.existingFile;
    } else {
      // Незаполненный табель — перезапись запрещена, только через удаление
      alert(
        `Невозможно создать новый табель.\n\nТабель для времени "${data.time}" и рабочего места "${data.workplace}" сейчас заполняется.\nЕго начал: ${checkResult.existingInspector}\n\nСначала удалите существующий табель из общего списка.`
      );
      return;
    }
  }

  // Создание табеля (файл создаётся сразу — блокирует место)
  const res = await fetch('/api/timesheets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  const created = await res.json();
  // Переход на страницу редактирования оценок
  window.location.href = `/edit.html?file=${encodeURIComponent(created.filename)}`;
});

// Загрузка списка времён при открытии страницы
loadTimes();