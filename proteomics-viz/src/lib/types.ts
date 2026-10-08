export type SectionId = "qc" | "downstream";

export type QcModuleId = "missingness" | "intensity" | "correlation";
export type DownstreamModuleId = "volcano" | "results";

export type ModuleId = QcModuleId | DownstreamModuleId;

export interface ExperimentAnnotation {
  file: string;
  sample: string;
  condition: string;
  replicate: string;
}

export interface ProteinRow {
  proteinId: string;
  gene: string;
  description: string;
  proteinProbability: number | null;
  /** sample name → MaxLFQ intensity (0 = missing) */
  maxlfq: Record<string, number>;
  /** contrast key → log2 fold change */
  log2fc: Record<string, number>;
  /** contrast key → adjusted p-value */
  adjP: Record<string, number>;
  raw: Record<string, string>;
}

export interface FragPipeDataset {
  proteins: ProteinRow[];
  samples: string[];
  maxlfqColumns: string[];
  contrasts: string[];
  annotation: ExperimentAnnotation[];
  source: "mock" | "upload";
  proteinFileName?: string;
  annotationFileName?: string;
}

export interface LoadState {
  status: "idle" | "loading" | "ready" | "error";
  error?: string;
  dataset?: FragPipeDataset;
}

export interface VolcanoPoint {
  proteinId: string;
  gene: string;
  log2fc: number;
  adjP: number;
  negLog10AdjP: number;
  significant: boolean;
  direction: "up" | "down" | "ns";
}
