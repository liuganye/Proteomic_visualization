import type {
  ExperimentAnnotation,
  FragPipeDataset,
  ProteinRow,
  VolcanoPoint,
} from "./types";

export function missingnessBySample(dataset: FragPipeDataset): {
  sample: string;
  condition: string;
  missingFraction: number;
  missingCount: number;
  total: number;
}[] {
  const cond = conditionMap(dataset.annotation);
  const n = dataset.proteins.length;
  return dataset.samples.map((sample) => {
    let missing = 0;
    for (const p of dataset.proteins) {
      const v = p.maxlfq[sample] ?? 0;
      if (v === 0 || !Number.isFinite(v)) missing += 1;
    }
    return {
      sample,
      condition: cond.get(sample) ?? "Unknown",
      missingFraction: n === 0 ? 0 : missing / n,
      missingCount: missing,
      total: n,
    };
  });
}

export function intensityLong(
  dataset: FragPipeDataset,
  opts?: { log10?: boolean; maxPoints?: number },
): { sample: string; condition: string; value: number; proteinId: string }[] {
  const log10 = opts?.log10 ?? true;
  const cond = conditionMap(dataset.annotation);
  const out: {
    sample: string;
    condition: string;
    value: number;
    proteinId: string;
  }[] = [];
  for (const p of dataset.proteins) {
    for (const sample of dataset.samples) {
      const raw = p.maxlfq[sample] ?? 0;
      if (raw <= 0 || !Number.isFinite(raw)) continue;
      const value = log10 ? Math.log10(raw) : raw;
      out.push({
        sample,
        condition: cond.get(sample) ?? "Unknown",
        value,
        proteinId: p.proteinId,
      });
    }
  }
  if (opts?.maxPoints && out.length > opts.maxPoints) {
    // systematic subsample for plotting performance
    const step = Math.ceil(out.length / opts.maxPoints);
    return out.filter((_, i) => i % step === 0);
  }
  return out;
}

export function intensityBoxBySample(dataset: FragPipeDataset): {
  sample: string;
  condition: string;
  min: number;
  q1: number;
  median: number;
  q3: number;
  max: number;
  n: number;
}[] {
  const long = intensityLong(dataset, { log10: true });
  const bySample = new Map<string, number[]>();
  for (const row of long) {
    const arr = bySample.get(row.sample) ?? [];
    arr.push(row.value);
    bySample.set(row.sample, arr);
  }
  const cond = conditionMap(dataset.annotation);
  return dataset.samples.map((sample) => {
    const vals = (bySample.get(sample) ?? []).slice().sort((a, b) => a - b);
    return {
      sample,
      condition: cond.get(sample) ?? "Unknown",
      ...quartiles(vals),
      n: vals.length,
    };
  });
}

function quartiles(sorted: number[]) {
  if (sorted.length === 0) {
    return { min: 0, q1: 0, median: 0, q3: 0, max: 0 };
  }
  const q = (p: number) => {
    const idx = (sorted.length - 1) * p;
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
  };
  return {
    min: sorted[0],
    q1: q(0.25),
    median: q(0.5),
    q3: q(0.75),
    max: sorted[sorted.length - 1],
  };
}

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let sumA = 0,
    sumB = 0,
    sumAB = 0,
    sumA2 = 0,
    sumB2 = 0;
  let used = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    used += 1;
    sumA += x;
    sumB += y;
    sumAB += x * y;
    sumA2 += x * x;
    sumB2 += y * y;
  }
  if (used < 2) return NaN;
  const num = used * sumAB - sumA * sumB;
  const den = Math.sqrt(
    (used * sumA2 - sumA * sumA) * (used * sumB2 - sumB * sumB),
  );
  if (den === 0) return NaN;
  return num / den;
}

/** Pairwise Pearson on log10 MaxLFQ (zeros treated as missing / skipped). */
export function sampleCorrelationMatrix(dataset: FragPipeDataset): {
  samples: string[];
  matrix: number[][];
} {
  const samples = dataset.samples;
  const vectors = samples.map((sample) =>
    dataset.proteins.map((p) => {
      const v = p.maxlfq[sample] ?? 0;
      return v > 0 ? Math.log10(v) : NaN;
    }),
  );
  const matrix = samples.map((_, i) =>
    samples.map((_, j) => {
      if (i === j) return 1;
      // pairwise complete
      const a: number[] = [];
      const b: number[] = [];
      for (let k = 0; k < vectors[i].length; k++) {
        const x = vectors[i][k];
        const y = vectors[j][k];
        if (Number.isFinite(x) && Number.isFinite(y)) {
          a.push(x);
          b.push(y);
        }
      }
      return pearson(a, b);
    }),
  );
  return { samples, matrix };
}

function conditionMap(annotation: ExperimentAnnotation[]) {
  const m = new Map<string, string>();
  for (const a of annotation) m.set(a.sample, a.condition);
  return m;
}

export function preferHumanVsQcContrast(contrasts: string[]): string | null {
  if (contrasts.length === 0) return null;
  const preferred = contrasts.find((c) =>
    /human.*qc|qc.*human/i.test(c.replace(/[_\s-]+/g, " ")),
  );
  return preferred ?? contrasts[0];
}

export function buildVolcano(
  dataset: FragPipeDataset,
  contrast: string,
  opts?: { log2fcThreshold?: number; adjPThreshold?: number },
): VolcanoPoint[] {
  const fcThr = opts?.log2fcThreshold ?? 1;
  const pThr = opts?.adjPThreshold ?? 0.05;
  const points: VolcanoPoint[] = [];
  for (const p of dataset.proteins) {
    const log2fc = p.log2fc[contrast];
    const adjP = p.adjP[contrast];
    if (log2fc === undefined || adjP === undefined) continue;
    if (!Number.isFinite(log2fc) || !Number.isFinite(adjP) || adjP <= 0)
      continue;
    const significant = Math.abs(log2fc) >= fcThr && adjP <= pThr;
    const direction: VolcanoPoint["direction"] = !significant
      ? "ns"
      : log2fc > 0
        ? "up"
        : "down";
    points.push({
      proteinId: p.proteinId,
      gene: p.gene || p.proteinId,
      log2fc,
      adjP,
      negLog10AdjP: -Math.log10(adjP),
      significant,
      direction,
    });
  }
  return points;
}

/** When no adj-p columns exist, approximate Human vs QC from MaxLFQ means. */
export function approximateHumanVsQc(
  dataset: FragPipeDataset,
): { contrast: string; points: VolcanoPoint[] } | null {
  const human = dataset.annotation
    .filter((a) => /human/i.test(a.condition))
    .map((a) => a.sample)
    .filter((s) => dataset.samples.includes(s));
  const qc = dataset.annotation
    .filter((a) => /^qc$/i.test(a.condition) || /\bqc\b/i.test(a.condition))
    .map((a) => a.sample)
    .filter((s) => dataset.samples.includes(s));
  if (human.length === 0 || qc.length === 0) return null;

  const points: VolcanoPoint[] = [];
  for (const p of dataset.proteins) {
    const hVals = human.map((s) => p.maxlfq[s] ?? 0).filter((v) => v > 0);
    const qVals = qc.map((s) => p.maxlfq[s] ?? 0).filter((v) => v > 0);
    if (hVals.length === 0 || qVals.length === 0) continue;
    const hMean = hVals.reduce((a, b) => a + b, 0) / hVals.length;
    const qMean = qVals.reduce((a, b) => a + b, 0) / qVals.length;
    const log2fc = Math.log2((hMean + 1) / (qMean + 1));
    const t = Math.abs(log2fc) / 0.4;
    // Deterministic pseudo-p from effect size (demo only; not a real DE test)
    const adjP = Math.min(
      1,
      Math.max(1e-12, Math.exp(-0.5 * t * t)),
    );
    const significant = Math.abs(log2fc) >= 1 && adjP <= 0.05;
    points.push({
      proteinId: p.proteinId,
      gene: p.gene || p.proteinId,
      log2fc,
      adjP,
      negLog10AdjP: -Math.log10(adjP),
      significant,
      direction: !significant ? "ns" : log2fc > 0 ? "up" : "down",
    });
  }
  return { contrast: "Human_vs_QC (approx from MaxLFQ)", points };
}

export function resultsTableRows(
  points: VolcanoPoint[],
): (VolcanoPoint & { rank: number })[] {
  return points
    .slice()
    .sort((a, b) => a.adjP - b.adjP || Math.abs(b.log2fc) - Math.abs(a.log2fc))
    .map((p, i) => ({ ...p, rank: i + 1 }));
}

export function datasetSummary(dataset: FragPipeDataset) {
  const conditions = Array.from(
    new Set(dataset.annotation.map((a) => a.condition)),
  );
  return {
    nProteins: dataset.proteins.length,
    nSamples: dataset.samples.length,
    nContrasts: dataset.contrasts.length,
    conditions,
    source: dataset.source,
  };
}

export function proteinHasMaxlfq(p: ProteinRow): boolean {
  return Object.values(p.maxlfq).some((v) => v > 0);
}
