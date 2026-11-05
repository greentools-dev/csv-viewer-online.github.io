export interface TransformStats {
  inputBytes: number;
  outputBytes: number;
  lineCount: number;
  recordCount: number;
  columnCount: number;
  keyCount: number;
  depth: number;
  valid: boolean;
  error?: string;
}

export function detectFormat(input: string): 'json' | 'csv' | 'base64' | 'text' {
  const trimmed = input.trim();
  if (!trimmed) return 'text';
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      JSON.parse(trimmed);
      return 'json';
    } catch {
      return 'json'; // likely malformed JSON intended as JSON
    }
  }
  const lines = trimmed.split(/\r?\n/);
  if (lines.length >= 2 && lines[0].includes(',')) {
    const firstCols = parseCsvLine(lines[0]).length;
    const secondCols = parseCsvLine(lines[1]).length;
    if (firstCols > 1 && firstCols === secondCols) {
      return 'csv';
    }
  }
  if (/^[A-Za-z0-9+/=]+\s*$/.test(trimmed) && trimmed.length % 4 === 0 && trimmed.length >= 8) {
    return 'base64';
  }
  return 'text';
}

export function parseCsvLine(line: string, delimiter = ','): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

export function csvToJson(csvText: string, delimiter = ',', parseNumbers = true): Record<string, unknown>[] {
  const lines = csvText
    .trim()
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0], delimiter).map((h, idx) => h.trim() || `column_${idx + 1}`);
  const rows: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const obj: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const raw = values[idx] !== undefined ? values[idx].trim() : '';
      if (parseNumbers && raw !== '' && !Number.isNaN(Number(raw))) {
        obj[header] = Number(raw);
      } else if (raw.toLowerCase() === 'true') {
        obj[header] = true;
      } else if (raw.toLowerCase() === 'false') {
        obj[header] = false;
      } else if (raw.toLowerCase() === 'null') {
        obj[header] = null;
      } else {
        obj[header] = raw;
      }
    });
    rows.push(obj);
  }
  return rows;
}

export function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value as Record<string, unknown>, nextKey));
    } else if (Array.isArray(value)) {
      result[nextKey] = JSON.stringify(value);
    } else {
      result[nextKey] = value;
    }
  }
  return result;
}

export function jsonToCsv(jsonInput: unknown, delimiter = ','): string {
  const arr = Array.isArray(jsonInput)
    ? jsonInput
    : typeof jsonInput === 'object' && jsonInput !== null
      ? [jsonInput]
      : [{ value: jsonInput }];

  if (arr.length === 0) return '';

  const flatRows: Record<string, unknown>[] = arr.map((item) =>
    typeof item === 'object' && item !== null ? flattenObject(item as Record<string, unknown>) : { value: item }
  );

  const headerSet = new Set<string>();
  flatRows.forEach((row) => {
    Object.keys(row).forEach((k) => headerSet.add(k));
  });
  const headers = Array.from(headerSet);

  const escapeCsvCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [headers.map(escapeCsvCell).join(delimiter)];
  for (const row of flatRows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(delimiter));
  }
  return lines.join('\n');
}

export function jsonToSqlInsert(jsonInput: unknown, tableName = 'exported_records'): string {
  const arr = Array.isArray(jsonInput)
    ? jsonInput
    : typeof jsonInput === 'object' && jsonInput !== null
      ? [jsonInput]
      : [];
  if (arr.length === 0) return '-- No records to export';

  const flatRows: Record<string, unknown>[] = arr.map((item) =>
    typeof item === 'object' && item !== null ? flattenObject(item as Record<string, unknown>) : { value: item }
  );
  const headerSet = new Set<string>();
  flatRows.forEach((r) => Object.keys(r).forEach((k) => headerSet.add(k)));
  const headers = Array.from(headerSet);

  const sanitizeIdent = (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_');
  const formatSqlVal = (v: unknown): string => {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return `'${String(v).replace(/'/g, "''")}'`;
  };

  const colList = headers.map(sanitizeIdent).join(', ');
  const valueRows = flatRows.map(
    (row) => `  (${headers.map((h) => formatSqlVal(row[h])).join(', ')})`
  );

  return `INSERT INTO ${sanitizeIdent(tableName)} (${colList})\nVALUES\n${valueRows.join(',\n')};`;
}

export function sortObjectKeys(val: unknown): unknown {
  if (Array.isArray(val)) {
    return val.map(sortObjectKeys);
  }
  if (val !== null && typeof val === 'object') {
    const sorted: Record<string, unknown> = {};
    Object.keys(val as Record<string, unknown>)
      .sort((a, b) => a.localeCompare(b))
      .forEach((k) => {
        sorted[k] = sortObjectKeys((val as Record<string, unknown>)[k]);
      });
    return sorted;
  }
  return val;
}

export function computeJsonDepth(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0;
  if (Array.isArray(val)) {
    if (val.length === 0) return 1;
    return 1 + Math.max(...val.map(computeJsonDepth));
  }
  const values = Object.values(val as Record<string, unknown>);
  if (values.length === 0) return 1;
  return 1 + Math.max(...values.map(computeJsonDepth));
}

export function countJsonKeys(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0;
  if (Array.isArray(val)) {
    return val.reduce((acc: number, item) => acc + countJsonKeys(item), 0);
  }
  const keys = Object.keys(val as Record<string, unknown>);
  return keys.length + keys.reduce((acc, k) => acc + countJsonKeys((val as Record<string, unknown>)[k]), 0);
}
