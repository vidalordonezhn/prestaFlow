export interface CsvColumn<T> {
  header: string;
  field?: keyof T;
  format?: (row: T) => string | number;
}

/**
 * Utility to export an array of typed objects into a formatted CSV file.
 * Includes UTF-8 BOM so Excel opens Spanish characters (acentos, ñ) seamlessly.
 */
export function exportToCsv<T>(filename: string, data: T[], columns: CsvColumn<T>[]): void {
  if (!data || data.length === 0) {
    alert('No hay datos para exportar.');
    return;
  }

  const headers = columns.map(c => `"${c.header.replace(/"/g, '""')}"`).join(',');

  const rows = data.map(row => {
    return columns.map(col => {
      let val: any = '';
      if (col.format) {
        val = col.format(row);
      } else if (col.field) {
        val = row[col.field];
      }
      if (val === null || val === undefined) {
        val = '';
      }
      const strVal = String(val).replace(/"/g, '""');
      return `"${strVal}"`;
    }).join(',');
  });

  const csvContent = '\uFEFF' + [headers, ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
