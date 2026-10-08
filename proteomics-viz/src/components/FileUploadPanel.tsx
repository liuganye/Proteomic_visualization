"use client";

import { useRef, useState } from "react";
import type { LoadState } from "@/lib/types";

interface Props {
  state: LoadState;
  onLoadMock: () => void;
  onLoadFiles: (protein: File, annotation?: File | null) => void;
  onClear: () => void;
}

export function FileUploadPanel({
  state,
  onLoadMock,
  onLoadFiles,
  onClear,
}: Props) {
  const proteinRef = useRef<HTMLInputElement>(null);
  const annRef = useRef<HTMLInputElement>(null);
  const [proteinFile, setProteinFile] = useState<File | null>(null);
  const [annFile, setAnnFile] = useState<File | null>(null);
  const loading = state.status === "loading";

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-wide text-slate-800 uppercase">
        Data input
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        Upload FragPipe outputs or load built-in mock HYE-style data. Expects{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">
          combined_protein.tsv
        </code>{" "}
        (MaxLFQ + optional adj. p / log2FC) and optional{" "}
        <code className="rounded bg-slate-100 px-1 text-xs">
          experiment_annotation.tsv
        </code>
        .
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            combined_protein.tsv
          </span>
          <input
            ref={proteinRef}
            type="file"
            accept=".tsv,.txt,text/tab-separated-values,text/plain"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-teal-800"
            onChange={(e) => setProteinFile(e.target.files?.[0] ?? null)}
            disabled={loading}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-slate-700">
            experiment_annotation.tsv{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </span>
          <input
            ref={annRef}
            type="file"
            accept=".tsv,.txt,text/tab-separated-values,text/plain"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-slate-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-slate-800"
            onChange={(e) => setAnnFile(e.target.files?.[0] ?? null)}
            disabled={loading}
          />
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={loading || !proteinFile}
          onClick={() => proteinFile && onLoadFiles(proteinFile, annFile)}
          className="rounded-md bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading…" : "Parse uploads"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={(e) => {
            e.preventDefault();
            onLoadMock();
          }}
          className="rounded-md border border-teal-700 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-900 hover:bg-teal-100 disabled:opacity-50"
          data-testid="load-mock-data"
        >
          {loading ? "Loading mock…" : "Load mock data"}
        </button>
        {state.status === "ready" && (
          <button
            type="button"
            onClick={() => {
              setProteinFile(null);
              setAnnFile(null);
              if (proteinRef.current) proteinRef.current.value = "";
              if (annRef.current) annRef.current.value = "";
              onClear();
            }}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Clear
          </button>
        )}
      </div>

      {state.status === "idle" && (
        <p className="mt-3 text-sm text-slate-500">
          No data loaded yet. Use mock data for a quick demo, or upload your
          FragPipe TSVs.
        </p>
      )}
      {state.status === "loading" && (
        <p className="mt-3 text-sm text-teal-800" role="status">
          Parsing protein table…
        </p>
      )}
      {state.status === "error" && (
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {state.error}
        </p>
      )}
      {state.status === "ready" && state.dataset && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-slate-500">Proteins</dt>
            <dd className="font-semibold text-slate-900">
              {state.dataset.proteins.length}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Samples</dt>
            <dd className="font-semibold text-slate-900">
              {state.dataset.samples.length}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Contrasts</dt>
            <dd className="font-semibold text-slate-900">
              {state.dataset.contrasts.length || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Source</dt>
            <dd className="font-semibold text-slate-900">
              {state.dataset.source}
            </dd>
          </div>
          <div className="col-span-2 sm:col-span-4">
            <dt className="text-slate-500">Files</dt>
            <dd className="truncate text-slate-800">
              {state.dataset.proteinFileName}
              {state.dataset.annotationFileName
                ? ` · ${state.dataset.annotationFileName}`
                : ""}
            </dd>
          </div>
        </dl>
      )}
    </section>
  );
}
