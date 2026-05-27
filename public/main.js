// Элементы страницы
const listEl = document.getElementById('timesheets-list');
const btnNew = document.getElementById('btn-new');
const btnReport = document.getElementById('btn-report');
const btnLog = document.getElementById('btn-log');
const btnDeleteAll = document.getElementById('btn-delete-all');
const btnScrollTop = document.getElementById('btn-scroll-top');
const btnScrollBottom = document.getElementById('btn-scroll-bottom');

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

  if (timesheets.length === 0) {
    listEl.innerHTML = '<div class="empty">Нет активных табелей</div>';
    return;
  }

  // Сборка HTML-карточек табелей (новые вверху, сервер уже отсортировал)
  listEl.innerHTML = timesheets.map(ts => {
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

// Кнопка "Новый табель"
btnNew.addEventListener('click', () => {
  window.location.href = '/create.html';
});

// Кнопка "Выгрузить табели" — сводный отчёт
btnReport.addEventListener('click', () => {
  window.open('/api/report', '_blank');
});

// Кнопка "Выгрузить лог" — лог операций
btnLog.addEventListener('click', () => {
  window.open('/api/log', '_blank');
});

// Кнопка "Удалить все табели"
btnDeleteAll.addEventListener('click', async () => {
  if (!confirm('Вы уверены, что хотите удалить ВСЕ табели?\n\nЭто действие нельзя отменить. Все файлы будут помечены как удалённые.')) return;

  const res = await fetch('/api/timesheets');
  const timesheets = await res.json();

  for (const ts of timesheets) {
    await fetch(`/api/timesheets/${encodeURIComponent(ts.filename)}`, { method: 'DELETE' });
  }

  loadList();
});

// Плавающие кнопки скролла
btnScrollTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

btnScrollBottom.addEventListener('click', () => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

// Первоначальная загрузка списка
loadList();