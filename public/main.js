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
const listEl = document.getElementById('timesheets-list');
const btnNew = document.getElementById('btn-new');
const btnReport = document.getElementById('btn-report');
const btnLog = document.getElementById('btn-log');
const btnScrollTop = document.getElementById('btn-scroll-top');
const btnScrollBottom = document.getElementById('btn-scroll-bottom');

// Форматирование ISO-даты
function formatDate(isoString) {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

// Загрузка списка табелей
async function loadList() {
  try {
    const res = await fetch('/api/timesheets');
    const timesheets = await res.json();

    if (timesheets.length === 0) {
      listEl.innerHTML = '<div class="empty">Нет активных табелей</div>';
      return;
    }

    listEl.innerHTML = timesheets.map(ts => {
      const incompleteClass = ts.complete ? '' : ' incomplete';
      const incompleteBadge = ts.complete ? '' : '<div class="incomplete-badge">не заполнен до конца</div>';
      const percentStr = ts.percent != null ? ` (${ts.percent}%)` : '';

      return `
    <div class="timesheet-item${incompleteClass}" data-filename="${escapeHtml(ts.filename)}">
      <div class="timesheet-info">
        <div class="time">${escapeHtml(ts.time)}</div>
        <div class="detail">${escapeHtml(ts.inspector)} — место ${escapeHtml(ts.workplace)}</div>
        <div class="dates">
          <div>Создан: ${formatDate(ts.created)}</div>
          <div>Изменён: ${formatDate(ts.modified)}</div>
        </div>
        <div class="total-badge">Итог: ${ts.totalScore != null ? ts.totalScore.toFixed(1) : '—'}${percentStr}</div>
        ${incompleteBadge}
      </div>
    </div>
  `;
    }).join('');

    listEl.querySelectorAll('.timesheet-item').forEach(item => {
      item.addEventListener('click', (e) => {
        const fn = item.dataset.filename;
        window.location.href = `/edit.html?file=${encodeURIComponent(fn)}`;
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Ошибка загрузки. Проверьте подключение к сети.</div>';
  }
}

// Кнопка "Новый табель"
btnNew.addEventListener('click', () => {
  window.location.href = '/create.html';
});

// Кнопка "Отчет"
btnReport.addEventListener('click', () => {
  window.open('/api/report', '_blank');
});

// Кнопка "Журнал"
btnLog.addEventListener('click', () => {
  window.open('/api/log', '_blank');
});

// Плавающие кнопки скролла
btnScrollTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

btnScrollBottom.addEventListener('click', () => {
  window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
});

// Service Worker для PWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}

// Первоначальная загрузка
loadList();