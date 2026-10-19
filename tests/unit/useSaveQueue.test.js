import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createSaveQueueController,
  mergePayloadEntries
} from "../../app/LIB/hook/useSaveQueue.js";

const createDeferred = () => {
  let resolve;
  let reject;

  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
};

describe("useSaveQueue controller", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("merges payload entries in insertion order", () => {
    expect(
      mergePayloadEntries([
        { payload: { title: "초안" } },
        { payload: { content: "<p>본문</p>" } },
        { payload: { title: "완성본" } }
      ])
    ).toEqual({
      title: "완성본",
      content: "<p>본문</p>"
    });
  });

  it("merges deferred saves per id into one process call", async () => {
    vi.useFakeTimers();
    const onProcess = vi.fn().mockResolvedValue(true);
    const controller = createSaveQueueController(onProcess);

    await controller.save("doc-1", { title: "첫 제목" });
    await controller.save("doc-1", { content: "<p>본문</p>" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onProcess).toHaveBeenCalledTimes(1);
    expect(onProcess).toHaveBeenCalledWith(
      "doc-1",
      {
        title: "첫 제목",
        content: "<p>본문</p>"
      },
      { immediate: false }
    );
  });

  it("keeps different document ids isolated even when both are scheduled", async () => {
    vi.useFakeTimers();
    const onProcess = vi.fn().mockResolvedValue(true);
    const controller = createSaveQueueController(onProcess);

    await controller.save("doc-A", { title: "문서 A" });
    await controller.save("doc-B", { title: "문서 B" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(onProcess).toHaveBeenCalledTimes(2);
    expect(onProcess).toHaveBeenNthCalledWith(
      1,
      "doc-A",
      { title: "문서 A" },
      { immediate: false }
    );
    expect(onProcess).toHaveBeenNthCalledWith(
      2,
      "doc-B",
      { title: "문서 B" },
      { immediate: false }
    );
  });

  it("waits for queued immediate saves that arrive during an active save", async () => {
    const firstProcess = createDeferred();
    const onProcess = vi
      .fn()
      .mockImplementationOnce(() => firstProcess.promise)
      .mockResolvedValueOnce(true);
    const controller = createSaveQueueController(onProcess);

    const firstSavePromise = controller.save("doc-1", { title: "첫 저장" }, true);
    const secondSavePromise = controller.save(
      "doc-1",
      { content: "<p>후속 저장</p>" },
      true
    );

    expect(onProcess).toHaveBeenCalledTimes(1);

    firstProcess.resolve(true);

    await expect(firstSavePromise).resolves.toBe(true);
    await expect(secondSavePromise).resolves.toBe(true);

    expect(onProcess).toHaveBeenCalledTimes(2);
    expect(onProcess).toHaveBeenNthCalledWith(
      1,
      "doc-1",
      { title: "첫 저장" },
      { immediate: true }
    );
    expect(onProcess).toHaveBeenNthCalledWith(
      2,
      "doc-1",
      { content: "<p>후속 저장</p>" },
      { immediate: true }
    );
  });

  it("flushes pending deferred saves when an immediate save arrives", async () => {
    vi.useFakeTimers();
    const onProcess = vi.fn().mockResolvedValue(true);
    const controller = createSaveQueueController(onProcess);

    await controller.save("doc-1", { content: "<p>autosave</p>" });

    expect(controller.getSnapshot().scheduledIds).toEqual(["doc-1"]);

    const savePromise = controller.save(
      "doc-1",
      { focus: 7, title: "Manual save" },
      true
    );

    await expect(savePromise).resolves.toBe(true);

    expect(onProcess).toHaveBeenCalledTimes(1);
    expect(onProcess).toHaveBeenCalledWith(
      "doc-1",
      {
        content: "<p>autosave</p>",
        focus: 7,
        title: "Manual save"
      },
      { immediate: true }
    );
    expect(controller.getSnapshot().scheduledIds).toEqual([]);

    await vi.advanceTimersByTimeAsync(1000);
    expect(onProcess).toHaveBeenCalledTimes(1);
  });

  it("notifies queue state while deferred saves are waiting", async () => {
    vi.useFakeTimers();
    const queueSnapshots = [];
    const onProcess = vi.fn().mockResolvedValue(true);
    const controller = createSaveQueueController(onProcess, {
      onQueueChange: (snapshot) => queueSnapshots.push(snapshot)
    });

    await controller.save("doc-1", { content: "<p>draft</p>" });

    expect(queueSnapshots.at(-1)).toMatchObject({
      queuedIds: ["doc-1"],
      scheduledIds: ["doc-1"]
    });

    await vi.advanceTimersByTimeAsync(1000);

    expect(onProcess).toHaveBeenCalledTimes(1);
    expect(queueSnapshots.at(-1)).toMatchObject({
      queuedIds: [],
      scheduledIds: []
    });
  });

  it("notifies queue state for immediate saves queued behind an active save", async () => {
    const firstProcess = createDeferred();
    const queueSnapshots = [];
    const onProcess = vi
      .fn()
      .mockImplementationOnce(() => firstProcess.promise)
      .mockResolvedValueOnce(true);
    const controller = createSaveQueueController(onProcess, {
      onQueueChange: (snapshot) => queueSnapshots.push(snapshot)
    });

    const firstSavePromise = controller.save(
      "doc-1",
      { content: "<p>first</p>" },
      true
    );

    expect(onProcess).toHaveBeenCalledTimes(1);
    expect(queueSnapshots.at(-1)).toMatchObject({
      queuedIds: [],
      scheduledIds: []
    });

    const secondSavePromise = controller.save(
      "doc-1",
      { content: "<p>latest</p>" },
      true
    );

    expect(queueSnapshots.at(-1)).toMatchObject({
      queuedIds: ["doc-1"],
      scheduledIds: []
    });

    firstProcess.resolve(true);

    await expect(firstSavePromise).resolves.toBe(true);
    await expect(secondSavePromise).resolves.toBe(true);

    expect(queueSnapshots.at(-1)).toMatchObject({
      queuedIds: [],
      scheduledIds: []
    });
  });

  it("continues with queued immediate saves after an active save fails", async () => {
    const firstProcess = createDeferred();
    const onProcessError = vi.fn();
    const onProcess = vi
      .fn()
      .mockImplementationOnce(() => firstProcess.promise)
      .mockResolvedValueOnce(true);
    const controller = createSaveQueueController(onProcess, { onProcessError });

    const firstSavePromise = controller.save(
      "doc-1",
      { content: "<p>first</p>" },
      true
    );
    const secondSavePromise = controller.save(
      "doc-1",
      { content: "<p>latest</p>" },
      true
    );

    expect(onProcess).toHaveBeenCalledTimes(1);

    const processError = new Error("network failed");
    firstProcess.reject(processError);

    await expect(firstSavePromise).resolves.toBe(false);
    await expect(secondSavePromise).resolves.toBe(true);

    expect(onProcessError).toHaveBeenCalledWith(processError);
    expect(onProcess).toHaveBeenCalledTimes(2);
    expect(onProcess).toHaveBeenNthCalledWith(
      2,
      "doc-1",
      { content: "<p>latest</p>" },
      { immediate: true }
    );
    expect(controller.getSnapshot()).toMatchObject({
      activeProcesses: 0,
      isSaving: false,
      processingIds: [],
      queuedIds: [],
      scheduledIds: []
    });
  });

  it("clears pending timers on dispose", async () => {
    vi.useFakeTimers();
    const onProcess = vi.fn().mockResolvedValue(true);
    const controller = createSaveQueueController(onProcess);

    await controller.save("doc-1", { title: "임시 저장" });
    controller.dispose();
    await vi.runAllTimersAsync();

    expect(onProcess).not.toHaveBeenCalled();
    expect(controller.getSnapshot().queuedIds).toEqual([]);
    expect(controller.getSnapshot().scheduledIds).toEqual([]);
  });

  it("notifies saving state changes around processing", async () => {
    const savingStates = [];
    const deferred = createDeferred();
    const onProcess = vi.fn().mockImplementationOnce(() => deferred.promise);
    const controller = createSaveQueueController(onProcess, {
      onSavingChange: (nextState) => savingStates.push(nextState)
    });

    const savePromise = controller.save("doc-1", { title: "저장" }, true);

    expect(savingStates).toEqual([true]);

    deferred.resolve(true);
    await savePromise;

    expect(savingStates).toEqual([true, false]);
  });

  it("notifies settled save results after each process attempt", async () => {
    const processError = new Error("network failed");
    const onProcessError = vi.fn();
    const settledResults = [];
    const onProcess = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(processError);
    const controller = createSaveQueueController(onProcess, {
      onProcessError,
      onProcessSettled: (result) => settledResults.push(result)
    });

    await expect(
      controller.save("doc-1", { content: "<p>saved</p>" }, true)
    ).resolves.toBe(true);
    await expect(
      controller.save("doc-1", { content: "<p>failed</p>" }, true)
    ).resolves.toBe(false);

    expect(onProcessError).toHaveBeenCalledWith(processError);
    expect(settledResults).toEqual([
      { id: "doc-1", result: true },
      { id: "doc-1", result: false }
    ]);
  });

  it("returns false and clears saving state when processing fails", async () => {
    const processError = new Error("Storage permission denied");
    const savingStates = [];
    const onProcessError = vi.fn();
    const onProcess = vi.fn().mockRejectedValueOnce(processError);
    const controller = createSaveQueueController(onProcess, {
      onProcessError,
      onSavingChange: (nextState) => savingStates.push(nextState)
    });

    await expect(
      controller.save("doc-1", { content: "<p>failed</p>" }, true)
    ).resolves.toBe(false);

    expect(onProcessError).toHaveBeenCalledWith(processError);
    expect(savingStates).toEqual([true, false]);
    expect(controller.getSnapshot()).toMatchObject({
      activeProcesses: 0,
      isSaving: false,
      processingIds: [],
      queuedIds: [],
      scheduledIds: []
    });
  });

  it("resolves each immediate caller with the result of its own queued batch", async () => {
    const firstProcess = createDeferred();
    const onProcess = vi
      .fn()
      .mockImplementationOnce(() => firstProcess.promise)
      .mockResolvedValueOnce(false);
    const controller = createSaveQueueController(onProcess);

    const firstSave = controller.save("doc-1", { title: "first" }, true);
    const secondSave = controller.save("doc-1", { docLinkShare: true }, true);

    firstProcess.resolve(true);

    await expect(firstSave).resolves.toBe(true);
    await expect(secondSave).resolves.toBe(false);
    expect(onProcess).toHaveBeenNthCalledWith(
      2,
      "doc-1",
      { docLinkShare: true },
      { immediate: true }
    );
  });
});
