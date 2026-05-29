function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const todayEl = document.getElementById('today-timesheets');
const pastEl = document.getElementById('past-shifts-list');

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
  });
});

async function loadToday() {
  try {
    const res = await fetch('/api/timesheets/today');
    const groups = await res.json();

    let html = '';

    for (const group of groups) {
      const reportUrl = `/api/report/${escapeHtml(group.dateSlug)}_${escapeHtml(group.shiftSlug)}`;

      html += `<div class="group-header">
        <h2 class="group-heading">${escapeHtml(group.timeLabel)}</h2>
        <a href="${reportUrl}" target="_blank" class="btn-report-shift" title="Ведомость смены">📋</a>
      </div>`;

      html += `<div class="timesheet-item label-item">
        <div class="label-text">Рабочие<br>места</div>
      </div>`;

      html += group.workplaces.map(wp => {
        let statusClass = 'status-missing';
        let icon = '+';
        let clickAction = `onclick="event.stopPropagation();window.location.href='/create.html?workplace=${escapeHtml(wp.workplace)}&shift=${escapeHtml(group.shiftSlug)}'"`;

        if (wp.exists && wp.complete) {
          statusClass = 'status-complete';
          icon = '✓';
          clickAction = `onclick="event.stopPropagation();if(confirm('Табель рабочего места ${escapeHtml(wp.workplace)} смены «${escapeHtml(group.shift)}» уже заполнен экспертом ${escapeHtml(wp.timesheet.inspector)}. Точно хотите изменить его?'))window.location.href='/edit.html?file=${encodeURIComponent(wp.filename)}'"`;
        } else if (wp.exists && !wp.complete) {
          statusClass = 'status-incomplete';
          icon = '✎';
          clickAction = `onclick="event.stopPropagation();window.location.href='/edit.html?file=${encodeURIComponent(wp.filename)}'"`;
        }

        return `
        <div class="timesheet-item ${statusClass} clickable" ${clickAction}>
          <div class="timesheet-info">
            <div class="detail">🖵 M.${escapeHtml(wp.workplace)}</div>
            ${wp.exists ? `<div class="dates">${escapeHtml(wp.timesheet.inspector)} · ${wp.timesheet.totalScore != null ? wp.timesheet.totalScore.toFixed(1) : '—'}${wp.timesheet.percent != null ? ' (' + wp.timesheet.percent + '%)' : ''}${wp.timesheet.grade != null ? ' · ' + wp.timesheet.grade : ''}</div>` : ''}
          </div>
          <div class="status-icon">${icon}</div>
        </div>`;
      }).join('');
    }

    todayEl.innerHTML = html;

  } catch (err) {
    todayEl.innerHTML = '<div class="empty">Ошибка загрузки</div>';
  }
}

async function loadPast() {
  try {
    const res = await fetch('/api/timesheets/past');
    const shifts = await res.json();

    if (shifts.length === 0) {
      pastEl.innerHTML = '<div class="empty">Нет прошедших смен</div>';
      return;
    }

    let html = '';

    for (const shift of shifts) {
      html += `<div class="past-group">
        <div class="past-group-header">
          <h2 class="past-group-title">${escapeHtml(shift.timeLabel)}</h2>
          <a href="/api/report/${encodeURIComponent(shift.slug)}" target="_blank" class="btn-report-shift" title="Ведомость смены">📋</a>
        </div>
        <div class="past-group-grid">`;

      for (const wp of shift.workplaces) {
        let statusClass = 'status-past-missing';
        let info = '';

        if (wp.exists && wp.timesheet && wp.timesheet.complete) {
          statusClass = 'status-past-complete';
          info = `<div class="dates">${escapeHtml(wp.timesheet.inspector)} · ${wp.timesheet.totalScore != null ? wp.timesheet.totalScore.toFixed(1) : '—'}${wp.timesheet.percent != null ? ' (' + wp.timesheet.percent + '%)' : ''}${wp.timesheet.grade != null ? ' · ' + wp.timesheet.grade : ''}</div>`;
        } else if (wp.exists && wp.timesheet && !wp.timesheet.complete) {
          statusClass = 'status-past-incomplete';
          info = `<div class="dates">${escapeHtml(wp.timesheet.inspector)} · —</div>`;
        } else if (wp.exists) {
          statusClass = 'status-past-complete';
          info = `<div class="dates">${escapeHtml(wp.timesheet.inspector)} · ${wp.timesheet.totalScore != null ? wp.timesheet.totalScore.toFixed(1) : '—'}${wp.timesheet.percent != null ? ' (' + wp.timesheet.percent + '%)' : ''}${wp.timesheet.grade != null ? ' · ' + wp.timesheet.grade : ''}</div>`;
        }

        html += `
        <div class="timesheet-item ${statusClass}">
          <div class="timesheet-info">
            <div class="detail">🖵 M.${escapeHtml(wp.workplace)}</div>
            ${info}
          </div>
        </div>`;
      }

      html += `</div></div>`;
    }

    pastEl.innerHTML = html;

  } catch (err) {
    pastEl.innerHTML = '<div class="empty">Ошибка загрузки</div>';
  }
}

let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => { touchStartX = e.changedTouches[0].screenX; });
document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
});

function handleSwipe() {
  const minSwipeDistance = 60;
  const swipeDistance = touchEndX - touchStartX;
  if (Math.abs(swipeDistance) < minSwipeDistance) return;

  const tabs = document.querySelectorAll('.tab');
  const activeTab = document.querySelector('.tab.active');
  if (!activeTab || tabs.length < 2) return;
  const currentIndex = Array.from(tabs).indexOf(activeTab);

  if (swipeDistance < 0 && currentIndex < tabs.length - 1) tabs[currentIndex + 1].click();
  else if (swipeDistance > 0 && currentIndex > 0) tabs[currentIndex - 1].click();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

async function initClock() {
  try {
    const res = await fetch('/api/server-time');
    const data = await res.json();
    const [datePart, timePart] = data.datetime.split(' ');
    const [day, month, year] = datePart.split('.');
    const [hours, minutes, seconds] = timePart.split(':');
    const serverTime = new Date(year, month - 1, day, hours, minutes, seconds);
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
      if (el) el.textContent = `${d}.${m}.${y} ${h}:${min}:${s} (${data.tz})`;
    }

    updateClock();
    setInterval(updateClock, 1000);
  } catch (err) {}
}

initClock();
loadToday();
loadPast();