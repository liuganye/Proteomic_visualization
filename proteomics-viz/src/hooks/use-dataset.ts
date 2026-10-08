"use client";

import { useCallback, useState } from "react";
import {
  buildDataset,
  fetchMockDataset,
  readFileAsText,
} from "@/lib/parse-fragpipe";
import type { LoadState } from "@/lib/types";

export function useDataset() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  const loadMock = useCallback(() => {
    setState({ status: "loading" });
    void (async () => {
      try {
        const dataset = await fetchMockDataset();
        setState({ status: "ready", dataset });
      } catch (e) {
        setState({
          status: "error",
          error: e instanceof Error ? e.message : "Failed to load mock data",
        });
      }
    })();
  }, []);

  const loadFiles = useCallback(
    async (proteinFile: File, annotationFile?: File | null) => {
      setState({ status: "loading" });
      try {
        const proteinText = await readFileAsText(proteinFile);
        const annotationText = annotationFile
          ? await readFileAsText(annotationFile)
          : null;
        const dataset = buildDataset({
          proteinText,
          annotationText,
          source: "upload",
          proteinFileName: proteinFile.name,
          annotationFileName: annotationFile?.name,
        });
        setState({ status: "ready", dataset });
      } catch (e) {
        setState({
          status: "error",
          error: e instanceof Error ? e.message : "Failed to parse uploaded files",
        });
      }
    },
    [],
  );

  const clear = useCallback(() => setState({ status: "idle" }), []);

  return { state, loadMock, loadFiles, clear };
}
