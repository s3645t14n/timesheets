const params = new URLSearchParams(window.location.search);
const reportUrl = params.get('src') || '/api/report/data';

async function loadReport() {
  try {
    const res = await fetch(reportUrl);
    const data = await res.json();

    document.getElementById('report-title').textContent = data.title || 'Ведомость';

    // Ссылка на печатную форму
    const printUrl = reportUrl.replace('/data', '');
    document.getElementById('print-link').innerHTML = `<a href="${printUrl}" target="_blank">Открыть печатную форму ведомости</a>`;

    if (data.empty) {
      document.getElementById('report-table').style.display = 'none';
      document.getElementById('empty-message').style.display = 'block';
      document.getElementById('empty-message').textContent = 'В этой ведомости пока нет заполненных табелей. Ведомость не может быть пустой.';
      return;
    }

    const columns = data.columns.map(col => ({ title: col }));
    const rows = data.rows;

    $('#report-table').DataTable({
      data: rows,
      columns: columns,
      paging: false,
      searching: false,
      ordering: false,
      info: false,
      scrollX: true,
      dom: 'Bfrtip',
      buttons: ['copy', 'csv', 'excel']
    });

  } catch (err) {
    document.getElementById('report-title').textContent = 'Ошибка загрузки';
  }
}

loadReport();