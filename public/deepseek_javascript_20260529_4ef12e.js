const params = new URLSearchParams(window.location.search);
const reportUrl = params.get('src') || '/api/report/data';

async function loadReport() {
  try {
    const res = await fetch(reportUrl);
    const data = await res.json();

    document.getElementById('report-title').textContent = data.title || 'Ведомость';

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