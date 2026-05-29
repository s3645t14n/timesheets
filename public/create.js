const inputInspector = document.getElementById('inspector');
const errorInspector = document.getElementById('error-inspector');
const btnCancel = document.getElementById('btn-cancel');
const form = document.getElementById('create-form');

const params = new URLSearchParams(window.location.search);
const workplace = params.get('workplace');
const shift = params.get('shift') || 'I';

if (!workplace) {
  alert('Не указано рабочее место');
  window.location.href = '/';
}

function validateInspector() {
  const value = inputInspector.value.trim();
  const nameRegex = /^[a-zA-Zа-яА-ЯёЁ .]+$/;
  if (value === '') { errorInspector.textContent = ''; return true; }
  if (!nameRegex.test(value)) { errorInspector.textContent = 'Только буквы, точки и пробелы'; return false; }
  errorInspector.textContent = '';
  return true;
}

inputInspector.addEventListener('input', validateInspector);

btnCancel.addEventListener('click', () => window.location.href = '/');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!validateInspector()) return;

  const inspector = inputInspector.value.trim();

  try {
    const res = await fetch('/api/timesheets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inspector, workplace, shift })
    });

    if (!res.ok) {
      const err = await res.json();
      alert(err.error || 'Не удалось создать табель');
      return;
    }

    const created = await res.json();
    window.location.href = `/edit.html?file=${encodeURIComponent(created.filename)}`;
  } catch (err) {
    alert('Ошибка создания табеля.');
  }
});

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