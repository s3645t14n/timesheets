// Элементы страницы
const listEl = document.getElementById('timesheets-list');
const btnNew = document.getElementById('btn-new');
const btnReport = document.getElementById('btn-report');

// Форматирование ISO-даты в читаемый вид "ДД.ММ.ГГГГ ЧЧ:ММ"
function formatDate(isoString) {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Загрузка списка табелей с сервера и отрисовка
async function loadList() {
  const res = await fetch('/api/timesheets');
  const timesheets = await res.json();

  // Пустой список
  if (timesheets.length === 0) {
    listEl.innerHTML = '<div class="empty">Нет активных табелей</div>';
    return;
  }

  // Сборка HTML-карточек табелей
  listEl.innerHTML = timesheets.map(ts => {
    // Дополнительный класс для незаполненных табелей
    const incompleteClass = ts.complete ? '' : ' incomplete';
    const incompleteBadge = ts.complete ? '' : '<div class="incomplete-badge">не заполнен до конца</div>';

    return `
    <div class="timesheet-item${incompleteClass}" data-filename="${ts.filename}">
      <div class="timesheet-info">
        <div class="time">${ts.time}</div>
        <div class="detail">${ts.inspector} — место ${ts.workplace}</div>
        <div class="dates">
          <div>Создан: ${formatDate(ts.created)}</div>
          <div>Изменён: ${formatDate(ts.modified)}</div>
        </div>
        ${incompleteBadge}
      </div>
      <button class="btn-delete" data-filename="${ts.filename}">Удалить</button>
    </div>
  `;
  }).join('');

  // Обработчик клика по карточке — переход к редактированию
  listEl.querySelectorAll('.timesheet-item').forEach(item => {
    item.addEventListener('click', (e) => {
      // Игнорируем клик по кнопке удаления
      if (e.target.classList.contains('btn-delete')) return;
      const filename = item.dataset.filename;
      window.location.href = `/edit.html?file=${encodeURIComponent(filename)}`;
    });
  });

  // Обработчик кнопки удаления табеля
  listEl.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const filename = btn.dataset.filename;
      if (confirm('Удалить табель?')) {
        await fetch(`/api/timesheets/${encodeURIComponent(filename)}`, { method: 'DELETE' });
        loadList();
      }
    });
  });
}

// Переход на страницу создания нового табеля
btnNew.addEventListener('click', () => {
  window.location.href = '/create.html';
});

// Открытие сводного отчёта в новом окне (для печати)
btnReport.addEventListener('click', () => {
  window.open('/api/report', '_blank');
});

// Первоначальная загрузка списка
loadList();