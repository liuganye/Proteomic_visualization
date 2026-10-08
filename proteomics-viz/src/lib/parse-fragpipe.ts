import Papa from "papaparse";
import type {
  ExperimentAnnotation,
  FragPipeDataset,
  ProteinRow,
} from "./types";

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseTsv(text: string): Record<string, string>[] {
  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    delimiter: "\t",
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  if (result.errors.length > 0) {
    const first = result.errors[0];
    throw new Error(`TSV parse error: ${first.message} (row ${first.row})`);
  }
  return result.data;
}

export function detectMaxlfqColumns(headers: string[]): string[] {
  return headers.filter(
    (h) =>
      h.endsWith(" MaxLFQ Intensity") ||
      h.endsWith(" MaxLFQ intensity") ||
      / MaxLFQ Intensity$/i.test(h),
  );
}

export function sampleFromMaxlfqCol(col: string): string {
  return col.replace(/ MaxLFQ Intensity$/i, "");
}

export function detectLog2FcColumns(headers: string[]): string[] {
  return headers.filter((h) => /Log2 Fold Change/i.test(h));
}

export function detectAdjPColumns(headers: string[]): string[] {
  return headers.filter(
    (h) => /Adjusted P-value/i.test(h) || /Adj\.?\s*P-value/i.test(h),
  );
}

export function contrastFromStatCol(col: string): string {
  return col
    .replace(/\s*Log2 Fold Change$/i, "")
    .replace(/\s*Adjusted P-value$/i, "")
    .replace(/\s*Adj\.?\s*P-value$/i, "")
    .trim();
}

function pickField(
  row: Record<string, string>,
  candidates: string[],
): string {
  for (const c of candidates) {
    if (row[c] !== undefined && row[c] !== "") return row[c];
  }
  return "";
}

export function parseCombinedProtein(
  text: string,
): Omit<FragPipeDataset, "annotation" | "source" | "proteinFileName" | "annotationFileName"> {
  const rows = parseTsv(text);
  if (rows.length === 0) {
    throw new Error("combined_protein.tsv has no data rows");
  }
  const headers = Object.keys(rows[0]);
  const maxlfqColumns = detectMaxlfqColumns(headers);
  if (maxlfqColumns.length === 0) {
    throw new Error(
      "No MaxLFQ Intensity columns found. Expected columns like '{sample} MaxLFQ Intensity'.",
    );
  }
  const samples = maxlfqColumns.map(sampleFromMaxlfqCol);
  const log2Cols = detectLog2FcColumns(headers);
  const adjPCols = detectAdjPColumns(headers);
  const contrasts = Array.from(
    new Set([
      ...log2Cols.map(contrastFromStatCol),
      ...adjPCols.map(contrastFromStatCol),
    ]),
  ).filter(Boolean);

  const proteins: ProteinRow[] = rows.map((row) => {
    const maxlfq: Record<string, number> = {};
    for (const col of maxlfqColumns) {
      const s = sampleFromMaxlfqCol(col);
      maxlfq[s] = num(row[col]) ?? 0;
    }
    const log2fc: Record<string, number> = {};
    for (const col of log2Cols) {
      const c = contrastFromStatCol(col);
      const v = num(row[col]);
      if (v !== null) log2fc[c] = v;
    }
    const adjP: Record<string, number> = {};
    for (const col of adjPCols) {
      const c = contrastFromStatCol(col);
      const v = num(row[col]);
      if (v !== null) adjP[c] = v;
    }
    return {
      proteinId: pickField(row, ["Protein ID", "Protein.ID", "ProteinID"]),
      gene: pickField(row, ["Gene", "Gene Name", "Gene Names"]),
      description: pickField(row, ["Description", "Protein Description"]),
      proteinProbability: num(
        pickField(row, ["Protein Probability", "Protein.Probability"]),
      ),
      maxlfq,
      log2fc,
      adjP,
      raw: row,
    };
  });

  return { proteins, samples, maxlfqColumns, contrasts };
}

export function parseExperimentAnnotation(text: string): ExperimentAnnotation[] {
  const rows = parseTsv(text);
  if (rows.length === 0) {
    throw new Error("experiment_annotation.tsv has no data rows");
  }
  const keys = Object.keys(rows[0]).map((k) => k.toLowerCase());
  const find = (names: string[]) => {
    const idx = keys.findIndex((k) => names.includes(k));
    return idx >= 0 ? Object.keys(rows[0])[idx] : null;
  };
  const sampleKey = find(["sample", "sample name", "samplename"]);
  const conditionKey = find(["condition", "group", "condition name"]);
  const fileKey = find(["file", "filename", "raw file"]);
  const repKey = find(["replicate", "rep", "bio_rep"]);

  if (!sampleKey || !conditionKey) {
    throw new Error(
      "experiment_annotation.tsv needs at least 'sample' and 'condition' columns",
    );
  }

  return rows.map((row) => ({
    file: fileKey ? row[fileKey] ?? "" : "",
    sample: row[sampleKey] ?? "",
    condition: row[conditionKey] ?? "",
    replicate: repKey ? row[repKey] ?? "" : "",
  }));
}

export function buildDataset(opts: {
  proteinText: string;
  annotationText?: string | null;
  source: "mock" | "upload";
  proteinFileName?: string;
  annotationFileName?: string;
}): FragPipeDataset {
  const core = parseCombinedProtein(opts.proteinText);
  let annotation: ExperimentAnnotation[] = [];
  if (opts.annotationText && opts.annotationText.trim()) {
    annotation = parseExperimentAnnotation(opts.annotationText);
  } else {
    // Infer conditions from sample names when annotation missing
    annotation = core.samples.map((sample, i) => ({
      file: `${sample}.raw`,
      sample,
      condition: /qc/i.test(sample)
        ? "QC"
        : /human/i.test(sample)
          ? "Human"
          : "Unknown",
      replicate: String(i + 1),
    }));
  }
  return {
    ...core,
    annotation,
    source: opts.source,
    proteinFileName: opts.proteinFileName,
    annotationFileName: opts.annotationFileName,
  };
}

export async function fetchMockDataset(): Promise<FragPipeDataset> {
  // Prefer bundled mock (reliable without depending on static fetch / HMR)
  try {
    const bundled = await import("@/data/mock-fragpipe.json");
    const proteinText = bundled.proteinText ?? bundled.default?.proteinText;
    const annotationText =
      bundled.annotationText ?? bundled.default?.annotationText;
    if (proteinText && annotationText) {
      return buildDataset({
        proteinText,
        annotationText,
        source: "mock",
        proteinFileName: "combined_protein.tsv (mock)",
        annotationFileName: "experiment_annotation.tsv (mock)",
      });
    }
  } catch {
    // fall through to HTTP mock
  }

  const [proteinRes, annRes] = await Promise.all([
    fetch("/mock-data/combined_protein.tsv"),
    fetch("/mock-data/experiment_annotation.tsv"),
  ]);
  if (!proteinRes.ok) {
    throw new Error(
      `Failed to load mock combined_protein.tsv (${proteinRes.status})`,
    );
  }
  if (!annRes.ok) {
    throw new Error(
      `Failed to load mock experiment_annotation.tsv (${annRes.status})`,
    );
  }
  const proteinText = await proteinRes.text();
  const annotationText = await annRes.text();
  return buildDataset({
    proteinText,
    annotationText,
    source: "mock",
    proteinFileName: "combined_protein.tsv (mock)",
    annotationFileName: "experiment_annotation.tsv (mock)",
  });
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}
