const listEl = document.getElementById('all-timesheets-list');
const btnBack = document.getElementById('btn-back');

function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(isoString) {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

async function loadAll() {
  try {
    const res = await fetch('/api/timesheets/all');
    const timesheets = await res.json();

    if (timesheets.length === 0) {
      listEl.innerHTML = '<div class="empty">Нет табелей</div>';
      return;
    }

    listEl.innerHTML = timesheets.map(ts => {
      const deletedClass = ts.deleted ? ' deleted' : '';
      const deletedBadge = ts.deleted ? '<div class="deleted-badge">удалён</div>' : '';

      return `
      <div class="timesheet-item${deletedClass}" data-filename="${escapeHtml(ts.filename)}">
        <div class="timesheet-info">
          <div class="time">${escapeHtml(ts.time)}</div>
          <div class="detail">${escapeHtml(ts.inspector)} — место ${escapeHtml(ts.workplace)}</div>
          <div class="dates">
            <div>Создан: ${formatDate(ts.created)}</div>
            <div>Изменён: ${formatDate(ts.modified)}</div>
          </div>
          ${deletedBadge}
        </div>
        ${!ts.deleted ? `<button class="btn-delete" data-filename="${escapeHtml(ts.filename)}">Удалить</button>` : ''}
      </div>
    `;
    }).join('');

    listEl.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const fn = btn.dataset.filename;
        if (confirm('Пометить табель удалённым?')) {
          try {
            await fetch(`/api/timesheets/${encodeURIComponent(fn)}`, { method: 'DELETE' });
            loadAll();
          } catch (err) {
            alert('Ошибка удаления. Проверьте подключение к сети.');
          }
        }
      });
    });
  } catch (err) {
    listEl.innerHTML = '<div class="empty">Ошибка загрузки.</div>';
  }
}

btnBack.addEventListener('click', () => {
  window.location.href = '/';
});

loadAll();