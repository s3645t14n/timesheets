const inputInspector = document.getElementById('inspector');
const errorInspector = document.getElementById('error-inspector');
const btnCancel = document.getElementById('btn-cancel');
const form = document.getElementById('create-form');
const heading = document.querySelector('h1');

const params = new URLSearchParams(window.location.search);
const workplace = params.get('workplace');
const shift = params.get('shift') || 'I';
const editFile = params.get('edit');

async function init() {
  if (editFile) {
    heading.textContent = 'Редактирование табеля';
    try {
      const res = await fetch(`/api/timesheets/${encodeURIComponent(editFile)}`);
      const existing = await res.json();
      inputInspector.value = existing.inspector || '';
    } catch (err) {
      alert('Не удалось загрузить табель');
      window.location.href = '/';
    }
  } else if (!workplace) {
    alert('Не указано рабочее место');
    window.location.href = '/';
  }
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
    if (editFile) {
      const res = await fetch(`/api/timesheets/${encodeURIComponent(editFile)}`);
      const existing = await res.json();

      const payload = {
        inspector: inspector,
        scores: existing.scores || {},
        totalScore: existing.totalScore || 0,
        percent: existing.percent || 0,
        grade: existing.grade || null
      };

      await fetch(`/api/timesheets/${encodeURIComponent(editFile)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      window.location.href = `/edit.html?file=${encodeURIComponent(editFile)}`;
    } else {
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
    }
  } catch (err) {
    alert('Ошибка.');
  }
});

init();