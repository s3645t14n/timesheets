function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const listEl = document.getElementById('timesheets-list');
const btnScrollTop = document.getElementById('btn-scroll-top');
const btnScrollBottom = document.getElementById('btn-scroll-bottom');

function formatDate(isoString) {
  const d = new Date(isoString);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

async function loadMatrix() {
  try {
    const res = await fetch('/api/timesheets/matrix');
    const matrix = await res.json();

    if (matrix.length === 0) {
      listEl.innerHTML = '<div class="empty">Нет доступных смен</div>';
      return;
    }

    let html = '';

    for (const group of matrix) {
      const pastClass = group.past ? ' past-group' : '';

            html += `<h2 class="group-heading${pastClass}">${escapeHtml(group.timeLabel)}${group.past ? ' <span class="closed-badge">(закрыта)</span>' : ''}</h2>`;

      for (const wp of group.workplaces) {
        let statusClass = 'status-missing';
        let badge = '';
        let button = '';

        if (group.past) {
          if (wp.exists && wp.complete) {
            statusClass = 'status-past-complete';
            badge = `<div class="status-badge">✓</div>`;
          } else if (wp.exists && !wp.complete) {
            statusClass = 'status-past-incomplete';
            badge = `<div class="status-badge">✗</div>`;
          } else {
            statusClass = 'status-past-missing';
            badge = `<div class="status-badge">—</div>`;
          }
        } else {
          if (wp.exists && wp.complete) {
            statusClass = 'status-complete';
            badge = `<div class="status-badge">✓</div>`;
            button = `<button class="btn-edit" data-filename="${escapeHtml(wp.filename)}">Изменить</button>`;
          } else if (wp.exists && !wp.complete) {
            statusClass = 'status-incomplete';
            badge = `<div class="status-badge">⚠</div>`;
            button = `<button class="btn-continue" data-filename="${escapeHtml(wp.filename)}">Продолжить</button>`;
          } else {
            statusClass = 'status-missing';
            badge = `<div class="status-badge">+</div>`;
            button = `<button class="btn-create-ts" data-workplace="${escapeHtml(wp.workplace)}">Создать</button>`;
          }
        }

        html += `
        <div class="timesheet-item ${statusClass}" data-filename="${escapeHtml(wp.filename)}" data-workplace="${escapeHtml(wp.workplace)}">
          <div class="timesheet-info">
            <div class="detail">Место ${escapeHtml(wp.workplace)}</div>
            ${wp.exists ? `
              <div class="dates">
                <div>${escapeHtml(wp.timesheet.inspector)}</div>
                <div>Итог: ${wp.timesheet.totalScore != null ? wp.timesheet.totalScore.toFixed(1) : '—'}${wp.timesheet.percent != null ? ' (' + wp.timesheet.percent + '%)' : ''}</div>
              </div>
            ` : '<div class="dates"><div>Табель не создан</div></div>'}
          </div>
          ${badge}
          ${button}
        </div>`;
      }
    }

    listEl.innerHTML = html;

    // Кнопка "Создать"
    listEl.querySelectorAll('.btn-create-ts').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wp = btn.dataset.workplace;
        window.location.href = `/create.html?workplace=${encodeURIComponent(wp)}`;
      });
    });

    // Кнопка "Продолжить"
    listEl.querySelectorAll('.btn-continue').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fn = btn.dataset.filename;
        window.location.href = `/edit.html?file=${encodeURIComponent(fn)}`;
      });
    });

    // Кнопка "Изменить"
    listEl.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const fn = btn.dataset.filename;
        window.location.href = `/edit.html?file=${encodeURIComponent(fn)}`;
      });
    });

  } catch (err) {
    listEl.innerHTML = '<div class="empty">Ошибка загрузки.</div>';
  }
}

btnScrollTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
btnScrollBottom.addEventListener('click', () => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

async function loadUpcoming() {
  const noticesEl = document.getElementById('upcoming-notices');
  try {
    const res = await fetch('/api/timesheets/upcoming');
    const upcoming = await res.json();

    if (upcoming.length === 0) {
      noticesEl.innerHTML = '';
      return;
    }

    noticesEl.innerHTML = upcoming.map(item => `
      <div class="notice-item">
        <span class="notice-icon">📅</span>
        <span class="notice-text">${escapeHtml(item.label)}</span>
        <span class="notice-time">с 00:00</span>
      </div>
    `).join('');
  } catch (err) {
    noticesEl.innerHTML = '';
  }
}

// Часы (синхронизируются с сервером)
async function initClock() {
  try {
    const res = await fetch('/api/server-time');
    const data = await res.json();

    const serverTime = new Date();
    // Парсим дату от сервера, чтобы узнать смещение
    const [datePart, timePart] = data.datetime.split(' ');
    const [day, month, year] = datePart.split('.');
    const [hours, minutes, seconds] = timePart.split(':');
    serverTime.setFullYear(year, month - 1, day);
    serverTime.setHours(hours, minutes, seconds, 0);

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
      if (el) {
        el.textContent = `${d}.${m}.${y} ${h}:${min}:${s} (${data.tz})`;
      }
    }

    updateClock();
    setInterval(updateClock, 1000);
  } catch (err) {
    // fallback на локальное время
  }
}

initClock();

loadMatrix();
loadUpcoming();