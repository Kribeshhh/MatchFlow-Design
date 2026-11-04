export function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@\-\t\r\n]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}
export function csvRows(rows: unknown[][]) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
