// Small enhancements. Every page works without this file.
(function () {
  // Copy link: shown only where the clipboard is available, with a spoken confirmation.
  var copy = document.querySelector('[data-copy-link]');
  var status = document.querySelector('[data-copy-status]');
  if (copy && status && navigator.clipboard && window.isSecureContext) {
    copy.hidden = false;
    copy.addEventListener('click', function () {
      navigator.clipboard.writeText(location.href.split('#')[0]).then(function () {
        status.textContent = 'Link copied';
        setTimeout(function () { status.textContent = ''; }, 3000);
      });
    });
  }

  // Phones restyle .stack tables as blocks, which drops table semantics in some screen readers.
  // Explicit roles keep rows, headers and cells announced.
  document.querySelectorAll('table.stack').forEach(function (table) {
    table.setAttribute('role', 'table');
    table.querySelectorAll('thead, tbody, tfoot').forEach(function (el) { el.setAttribute('role', 'rowgroup'); });
    table.querySelectorAll('tr').forEach(function (el) { el.setAttribute('role', 'row'); });
    table.querySelectorAll('th[scope="col"]').forEach(function (el) { el.setAttribute('role', 'columnheader'); });
    table.querySelectorAll('th[scope="row"]').forEach(function (el) { el.setAttribute('role', 'rowheader'); });
    table.querySelectorAll('td').forEach(function (el) { el.setAttribute('role', 'cell'); });
  });
})();
