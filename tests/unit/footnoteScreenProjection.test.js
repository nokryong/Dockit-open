/* @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  buildFootnoteScreenProjection
} from "../../app/LIB/pagination/render/buildFootnoteScreenProjection";
import {
  focusFootnoteContinuationAtPoint,
  mountFootnoteProjectionClone
} from "../../app/LIB/pagination/render/mountFootnoteProjectionClone";

const candidate = {
  status: "ok",
  footnotes: [{
    body: {
      noteId: "note-v1-screen",
      fragments: [
        { fragmentIndex: 0, measuredHeight: 10 },
        { fragmentIndex: 1, measuredHeight: 12 }
      ]
    }
  }]
};

const layout = {
  segments: [{
    noteId: "note-v1-screen",
    pageNumber: 1,
    referenceOrder: 1,
    segmentIndex: 0,
    continuation: "continues",
    continuationFromPreviousLabel: null,
    continuationToNextLabel: "다음 페이지에 계속",
    fragmentStartIndex: 0,
    fragmentEndIndex: 1
  }, {
    noteId: "note-v1-screen",
    pageNumber: 2,
    referenceOrder: 1,
    segmentIndex: 1,
    continuation: "continued",
    continuationFromPreviousLabel: "각주 계속",
    continuationToNextLabel: null,
    fragmentStartIndex: 1,
    fragmentEndIndex: 2
  }]
};

describe("footnote screen projection", () => {
  it("keeps DOM only in the transient projection and sanitizes cloned content", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="note-v1-screen" id="canonical">
        <button contenteditable="false">각주 편집</button>
        <div class="dockit-note-body-content" contenteditable="true"><p id="rich"><strong>굵게</strong> <a href="https://example.com" tabindex="0" onclick="alert(1)">내용</a></p></div>
      </section>`;
    const source = root.querySelector("section");
    source.setAttribute("data-dockit-footnote-projection-canonical", "true");
    source.style.position = "absolute";
    source.style.top = "400px";
    source.style.maxHeight = "10px";
    source.style.overflow = "clip";
    source.style.setProperty(
      "--dockit-footnote-canonical-fragment-height",
      "10px"
    );
    Object.defineProperty(source, "offsetWidth", { value: 120 });
    const projection = buildFootnoteScreenProjection({ view: { dom: root }, candidate, footnoteLayout: layout });

    expect(projection).toMatchObject({ status: "stable" });
    expect(projection.segments[0]).toMatchObject({ canonical: true, pageNumber: 1 });
    const continuation = projection.segments[1];
    expect(continuation).toMatchObject({ canonical: false, pageNumber: 2, offsetTop: 10, height: 12 });
    expect(continuation.clone.querySelector("button")).toBeNull();
    expect(continuation.clone.querySelector("[id]")).toBeNull();
    expect(continuation.clone.querySelector("[contenteditable]")).toBeNull();
    expect(continuation.clone.style.width).toBe("120px");
    expect(continuation.clone.style.margin).toBe("0px");
    expect(continuation.clone.style.position).toBe("");
    expect(continuation.clone.style.top).toBe("");
    expect(continuation.clone.style.maxHeight).toBe("");
    expect(continuation.clone.style.overflow).toBe("");
    expect(
      continuation.clone.hasAttribute(
        "data-dockit-footnote-projection-canonical"
      )
    ).toBe(false);
    expect(continuation.printClone.style.position).toBe("");
    expect(continuation.printClone.style.maxHeight).toBe("");
    expect(continuation.clone.getAttribute("inert")).toBe("");
    expect(continuation.clone.getAttribute("aria-hidden")).toBe("true");
    expect(continuation.clone.querySelector("a").hasAttribute("href")).toBe(false);
    expect(continuation.clone.querySelector("[tabindex]")).toBeNull();
    expect(continuation.clone.querySelector("[onclick]")).toBeNull();
    expect(continuation.clone.querySelector("a").style.getPropertyValue("pointer-events")).toBe("none");
    expect(root.querySelector("#canonical")).not.toBeNull();
    expect(
      source.getAttribute("data-dockit-footnote-projection-canonical")
    ).toBe("true");
    expect(source.style.position).toBe("absolute");
    const printHost = document.createElement("div");
    mountFootnoteProjectionClone(printHost, continuation, { print: true });
    const printLink = printHost.querySelector("a");
    expect(printHost.firstElementChild.style.transform).toBe("translateY(-10px)");
    expect(printLink.getAttribute("href")).toBe("https://example.com");
    expect(printLink.hasAttribute("target")).toBe(false);
    expect(printLink.hasAttribute("tabindex")).toBe(false);
    expect(printHost.querySelector("button")).toBeNull();
    expect(printHost.querySelector("[id]")).toBeNull();
    expect(printHost.querySelector("[onclick]")).toBeNull();
    expect(printHost.querySelector("section").getAttribute("role")).toBe("doc-footnote");
  });

  it("keeps the canonical first fragment clone-free and creates an inert continuation clone", () => {
    const root = document.createElement("div");
    root.innerHTML = `<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="note-v1-screen"><button>edit</button><div class="dockit-note-body-content"><p>x</p></div></section>`;
    Object.defineProperty(root.querySelector("section"), "offsetWidth", { value: 120 });
    const projection = buildFootnoteScreenProjection({
      view: { dom: root },
      candidate,
      footnoteLayout: {
        segments: [
          { ...layout.segments[0], pageNumber: 1, segmentIndex: 0, fragmentStartIndex: 0, fragmentEndIndex: 1 },
          layout.segments[0]
        ]
      }
    });

    expect(projection.segments).toHaveLength(2);
    expect(projection.segments[0].canonical).toBe(true);
    expect(projection.segments[0].clone).toBeUndefined();
    expect(projection.segments[1].canonical).toBe(false);
    expect(projection.segments[1].clone).toBeInstanceOf(HTMLElement);
  });

  it("fails closed for invalid fragment mapping and cleans mounted transient clones", () => {
    const root = document.createElement("div");
    root.innerHTML = `<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="note-v1-screen"><div class="dockit-note-body-content"><p>x</p></div></section>`;
    Object.defineProperty(root.querySelector("section"), "offsetWidth", { value: 120 });
    expect(buildFootnoteScreenProjection({
      view: { dom: root }, candidate,
      footnoteLayout: { segments: [{ ...layout.segments[0], fragmentEndIndex: 3 }] }
    })).toBeNull();

    const projection = buildFootnoteScreenProjection({ view: { dom: root }, candidate, footnoteLayout: layout });
    const host = document.createElement("div");
    const cleanup = mountFootnoteProjectionClone(host, projection.segments[1]);
    expect(host.textContent).toBe("x");
    cleanup();
    expect(host.childElementCount).toBe(0);
  });

  it("routes a point intercepted by the editor layer back to the canonical body", () => {
    const root = document.createElement("div");
    const continuation = document.createElement("div");
    continuation.className =
      "dockit-footnote-screen-projection--continuation";
    continuation.setAttribute("data-footnote-id", "note-v1-screen");
    continuation.getBoundingClientRect = () => ({
      left: 10,
      top: 20,
      right: 110,
      bottom: 70,
      width: 100,
      height: 50
    });
    root.appendChild(continuation);
    const editorRoot = document.createElement("div");
    editorRoot.className = "ProseMirror";
    editorRoot.innerHTML =
      '<section data-dockit-note-body="true" data-dockit-note-kind="footnote" data-dockit-note-id="note-v1-screen"></section>';
    const body = editorRoot.firstElementChild;
    body.scrollIntoView = vi.fn();
    const editor = { isEditable: false, view: { dom: editorRoot } };

    expect(focusFootnoteContinuationAtPoint({
      editor,
      root,
      clientX: 30,
      clientY: 40
    })).toBe(true);
    expect(body.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest"
    });
    expect(focusFootnoteContinuationAtPoint({
      editor,
      root,
      clientX: 200,
      clientY: 200
    })).toBe(false);
  });
});
