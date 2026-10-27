export interface ParsedItem {
  sap_code: string;
  description: string;
  boxes: number;
  pallets: number;
}

export interface ParsedLoad {
  load_date: string; // yyyy-mm-dd
  load_date_br: string; // dd/mm/aaaa
  load_number: string;
  origin_center: string;
  dest_center: string;
  dest_name: string;
  carrier: string;
  plate: string;
  dt: string;
  items: ParsedItem[];
  raw_lines: string[];
}

export interface ParseResult {
  loads: ParsedLoad[];
  rejected: string[];
}

const isBlank = (v: string | undefined) => !v || v.trim() === "" || v.trim() === "-";

/** "4.368" -> 4368 ; "1.234,5" -> 1234.5 ; "26" -> 26 */
export function parseNumberBR(v: string): number {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/\./g, "");
  return Number(normalized);
}

function toIsoDate(br: string): string | null {
  const m = br.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m as unknown as [string, string, string, string];
  const day = Number(d);
  const month = Number(mo);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function splitLine(line: string): string[] {
  const parts = line.includes("\t") ? line.split("\t") : line.split(/ {2,}/);
  return parts.map((p) => p.trim());
}

/** Parses lines pasted from the Remessa spreadsheet into loads grouped by DT. */
export function parseLoads(text: string): ParseResult {
  const rejected: string[] = [];
  const byDt = new Map<string, ParsedLoad>();
  let prev: string[] | null = null;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;
    const cols = splitLine(rawLine);
    while (cols.length < 12) cols.push("");
    if (cols.length > 12) {
      rejected.push(rawLine);
      continue;
    }

    // Continuation lines: "-" or empty header fields inherit from the previous line.
    const headerIdx = [0, 1, 2, 3, 4, 9, 10, 11];
    if (prev) {
      for (const i of headerIdx) if (isBlank(cols[i])) cols[i] = prev[i] ?? "";
    }

    const [dateBr, number, origin, destCenter, destName, sap, desc, boxesS, palletsS, carrier, plate, dt] = cols as unknown as string[] & { length: 12 } as unknown as [string, string, string, string, string, string, string, string, string, string, string, string];
    const iso = toIsoDate(dateBr);
    const boxes = parseNumberBR(boxesS);
    const pallets = parseNumberBR(palletsS);

    if (!iso || isBlank(dt) || !/^\d+$/.test(dt) || isBlank(sap) || isNaN(boxes) || isNaN(pallets) || isBlank(plate)) {
      rejected.push(rawLine);
      continue;
    }

    prev = cols;
    let load = byDt.get(dt);
    if (!load) {
      load = {
        load_date: iso,
        load_date_br: dateBr,
        load_number: number,
        origin_center: origin,
        dest_center: destCenter,
        dest_name: destName,
        carrier,
        plate: plate.toUpperCase(),
        dt,
        items: [],
        raw_lines: [],
      };
      byDt.set(dt, load);
    }
    load.items.push({ sap_code: sap, description: desc, boxes, pallets });
    load.raw_lines.push(cols.join("\t"));
  }

  return { loads: [...byDt.values()], rejected };
}

export const loadLabel = (plate: string, dt: string, carrier: string) =>
  `${plate} - ${dt.slice(-4)} | ${carrier}`;

/** Builds the formalization e-mail body in the spreadsheet format already used by the team. */
export function buildFormalizationEmail(loads: { raw_text: string; plate: string; dt: string; carrier: string }[]) {
  const subject =
    loads.length === 1 && loads[0]
      ? `Carga ${loadLabel(loads[0].plate, loads[0].dt, loads[0].carrier)}`
      : `Cargas para faturamento (${loads.length})`;
  const body = [
    "Prezados,",
    "",
    "Seguem as cargas para faturamento:",
    "",
    ...loads.map((l) => l.raw_text),
    "",
    "Att.",
  ].join("\n");
  return { subject, body };
}
