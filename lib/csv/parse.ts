import Papa from "papaparse";

export interface ParsedCsv {
  headers: string[];
  rows: ParsedCsvRow[];
  delimiter: string;
}

export interface ParsedCsvRow {
  /** 1-based data row number (header excluded). */
  rowNumber: number;
  values: Record<string, string>;
  /** Structural problems (e.g. wrong column count). Rows with errors are rejected. */
  errors: string[];
}

export class CsvParseError extends Error {}

export const MAX_CSV_ROWS = 5000;

/** Parse CSV text with a header row. Handles BOM, quoting and delimiter detection. */
export function parseCsv(text: string): ParsedCsv {
  const content = text.replace(/^﻿/, "");
  if (content.trim().length === 0) throw new CsvParseError("The file is empty.");

  const result = Papa.parse<string[]>(content, {
    header: false,
    skipEmptyLines: "greedy",
    delimitersToGuess: [",", ";", "\t", "|"],
  });

  const [headerRow, ...dataRows] = result.data;
  if (!headerRow) throw new CsvParseError("The file has no header row.");

  const headers = headerRow.map((h) => h.trim());
  if (headers.every((h) => h.length === 0)) throw new CsvParseError("The header row is empty.");
  const seen = new Set<string>();
  headers.forEach((h, i) => {
    if (h.length === 0) headers[i] = `column_${i + 1}`;
    if (seen.has(headers[i])) throw new CsvParseError(`Duplicate column header "${headers[i]}".`);
    seen.add(headers[i]);
  });
  if (dataRows.length === 0) throw new CsvParseError("The file has a header row but no data rows.");
  if (dataRows.length > MAX_CSV_ROWS) {
    throw new CsvParseError(`The file has ${dataRows.length} rows; the maximum per import is ${MAX_CSV_ROWS}.`);
  }

  const rows = dataRows.map((cells, index): ParsedCsvRow => {
    const errors: string[] = [];
    if (cells.length !== headers.length) {
      errors.push(`Expected ${headers.length} columns but found ${cells.length}.`);
    }
    const values: Record<string, string> = {};
    headers.forEach((header, i) => {
      values[header] = (cells[i] ?? "").trim();
    });
    return { rowNumber: index + 1, values, errors };
  });

  return { headers, rows, delimiter: result.meta.delimiter };
}
