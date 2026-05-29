const params = new URLSearchParams(window.location.search);
const reportUrl = params.get('src') || '/api/report/data';

async function loadReport() {
  try {
    const res = await fetch(reportUrl);
    const data = await res.json();

    document.getElementById('report-title').textContent = data.title || 'Ведомость';

    if (data.empty) {
      document.getElementById('report-table').style.display = 'none';
      const msg = document.createElement('div');
      msg.className = 'empty';
      msg.style.padding = '60px 0';
      msg.textContent = 'В этой ведомости пока нет заполненных табелей. Ведомость не может быть пустой.';
      document.querySelector('main.container').appendChild(msg);
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