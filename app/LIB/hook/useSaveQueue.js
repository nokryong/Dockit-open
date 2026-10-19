import { useCallback, useEffect, useRef, useState } from "react";

export const mergePayloadEntries = (entries) =>
  entries.reduce((acc, entry) => ({ ...acc, ...entry.payload }), {});

export const createSaveQueueController = (
  onProcess,
  {
    onSavingChange = () => {},
    onQueueChange = () => {},
    schedule = (callback, delay) => setTimeout(callback, delay),
    cancelScheduled = (timerId) => clearTimeout(timerId),
    onProcessSettled = () => {},
    onProcessError = (error) => console.error("저장 실패:", error)
  } = {}
) => {
  const saveQueue = new Map();
  const saveTimers = new Map();
  const processingPromises = new Map();
  const drainPromises = new Map();
  let activeProcesses = 0;
  let isDisposed = false;
  let isSaving = false;

  const getSnapshot = () => ({
    activeProcesses,
    isSaving,
    queuedIds: [...saveQueue.keys()],
    processingIds: [...processingPromises.keys()],
    scheduledIds: [...saveTimers.keys()]
  });

  const syncQueueState = () => {
    onQueueChange(getSnapshot());
  };

  const syncSavingState = () => {
    const nextSaving = activeProcesses > 0;

    if (isSaving === nextSaving) {
      return;
    }

    isSaving = nextSaving;
    onSavingChange(nextSaving);
  };

  const clearScheduledSave = (id) => {
    const timerId = saveTimers.get(id);

    if (timerId) {
      cancelScheduled(timerId);
      saveTimers.delete(id);
      syncQueueState();
    }
  };

  const processQueue = async (id) => {
    if (!id || isDisposed) {
      return;
    }

    const existingDrainPromise = drainPromises.get(id);
    if (existingDrainPromise) {
      return existingDrainPromise;
    }

    const drainPromise = (async () => {
      let latestResult = true;

      while (!isDisposed) {
        const queuedEntries = saveQueue.get(id);

        if (!queuedEntries?.length) {
          return latestResult;
        }

        clearScheduledSave(id);
        saveQueue.delete(id);
        syncQueueState();
        activeProcesses += 1;
        syncSavingState();

        const processPromise = (async () => {
          try {
            const mergedPayload = mergePayloadEntries(queuedEntries);
            const meta = {
              immediate: queuedEntries.some((entry) => entry.immediate)
            };

            return await onProcess(id, mergedPayload, meta);
          } catch (error) {
            onProcessError(error);
            return false;
          } finally {
            processingPromises.delete(id);
            activeProcesses = Math.max(0, activeProcesses - 1);
            syncSavingState();
          }
        })();

        processingPromises.set(id, processPromise);
        latestResult = await processPromise;
        queuedEntries.forEach((entry) => entry.resolve?.(latestResult));
        onProcessSettled({ id, result: latestResult });
      }

      return latestResult;
    })().finally(() => {
      drainPromises.delete(id);
    });

    drainPromises.set(id, drainPromise);
    return drainPromise;
  };

  const save = async (id, payload = {}, immediate = false) => {
    if (!id || isDisposed) {
      return;
    }

    const nextEntries = saveQueue.get(id) || [];
    let resolveBatchResult;
    const batchResult = immediate
      ? new Promise((resolve) => {
          resolveBatchResult = resolve;
        })
      : null;

    nextEntries.push({ payload, immediate, resolve: resolveBatchResult });
    saveQueue.set(id, nextEntries);
    syncQueueState();

    if (immediate) {
      clearScheduledSave(id);
      // Each caller receives its own batch result, not a later drain result.
      void processQueue(id);
      return batchResult;
    }

    clearScheduledSave(id);
    const timeoutId = schedule(() => {
      saveTimers.delete(id);
      processQueue(id);
    }, 1000);
    saveTimers.set(id, timeoutId);
    syncQueueState();
  };

  const dispose = () => {
    isDisposed = true;
    saveTimers.forEach((timerId) => cancelScheduled(timerId));
    saveTimers.clear();
    saveQueue.forEach((entries) => {
      entries.forEach((entry) => entry.resolve?.(false));
    });
    saveQueue.clear();
    drainPromises.clear();
    syncQueueState();
  };

  return {
    save,
    processQueue,
    clearScheduledSave,
    dispose,
    getSnapshot
  };
};

/**
 * 저장 큐 시스템 공통 훅
 * id별로 큐를 분리해 문서 간 payload가 섞이지 않도록 처리합니다.
 * @param {(id: string, mergedPayload: object, meta: { immediate: boolean }) => Promise<boolean>} onProcess - 실제 저장 처리 콜백
 * @returns {{ isSaving: boolean, hasQueuedSave: boolean, save: (id: string, payload?: object, immediate?: boolean) => Promise<boolean|undefined> }}
 */
export function useSaveQueue(onProcess) {
  const [isSaving, setIsSaving] = useState(false);
  const [hasQueuedSave, setHasQueuedSave] = useState(false);
  const [lastSaveResult, setLastSaveResult] = useState(null);
  const onProcessRef = useRef(onProcess);
  const controllerRef = useRef(null);

  useEffect(() => {
    onProcessRef.current = onProcess;
  }, [onProcess]);

  if (!controllerRef.current) {
    controllerRef.current = createSaveQueueController(
      (id, mergedPayload, meta) =>
        onProcessRef.current(id, mergedPayload, meta),
      {
        onSavingChange: setIsSaving,
        onQueueChange: ({ queuedIds, scheduledIds }) => {
          setHasQueuedSave(queuedIds.length > 0 || scheduledIds.length > 0);
        },
        onProcessSettled: ({ id, result }) => {
          setLastSaveResult({
            id,
            ok: result === true,
            completedAt: Date.now()
          });
        }
      }
    );
  }

  useEffect(
    () => () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    },
    []
  );

  const save = useCallback(
    (...args) => controllerRef.current?.save(...args),
    []
  );

  return {
    isSaving,
    hasQueuedSave,
    lastSaveResult,
    save
  };
}
