import { useEffect } from "react";

export default function useContentEditorPrintFixups(viewPage, editorContainerRef, printInlineFixupsRef) {
  useEffect(() => {
    if (typeof window === "undefined" || !viewPage) {
      return undefined;
    }

    const restorePrintFixups = () => {
      printInlineFixupsRef.current.forEach(({ element, style }) => {
        if (!element?.isConnected) {
          return;
        }

        if (style === null) {
          element.removeAttribute("style");
          return;
        }

        element.setAttribute("style", style);
      });

      printInlineFixupsRef.current = [];
    };

    const applyPrintFixups = () => {
      restorePrintFixups();

      const nextFixups = [];
      const seen = new Set();
      const rememberElement = (element) => {
        if (!element || seen.has(element)) {
          return;
        }

        seen.add(element);
        nextFixups.push({
          element,
          style: element.getAttribute("style")
        });
      };

      const setImportant = (element, property, value) => {
        element.style.setProperty(property, value, "important");
      };

      const containerElement = editorContainerRef.current;
      if (containerElement) {
        let ancestorElement = containerElement.parentElement;

        while (
          ancestorElement &&
          ancestorElement !== document.body &&
          ancestorElement !== document.documentElement
        ) {
          rememberElement(ancestorElement);
          setImportant(ancestorElement, "overflow", "visible");
          setImportant(ancestorElement, "height", "auto");
          setImportant(ancestorElement, "min-height", "0");
          setImportant(ancestorElement, "max-height", "none");
          ancestorElement = ancestorElement.parentElement;
        }

        containerElement
          .querySelectorAll(".tiptap-page-shell-layer")
          .forEach((element) => {
            rememberElement(element);
            setImportant(element, "display", "none");
            setImportant(element, "visibility", "hidden");
            setImportant(element, "height", "0");
            setImportant(element, "min-height", "0");
            setImportant(element, "max-height", "0");
            setImportant(element, "overflow", "hidden");
          });

        containerElement.querySelectorAll(".page-gap").forEach((element) => {
          rememberElement(element);
          setImportant(element, "display", "none");
          setImportant(element, "height", "0");
          setImportant(element, "min-height", "0");
          setImportant(element, "max-height", "0");
          setImportant(element, "margin", "0");
          setImportant(element, "padding", "0");
          setImportant(element, "overflow", "hidden");
        });

        containerElement
          .querySelectorAll(
            ".tiptap-final-page-filler .page-footer-spacer, .tiptap-page-break-structure--final .page-footer-spacer"
          )
          .forEach((element) => {
            rememberElement(element);
            setImportant(element, "display", "block");
            setImportant(element, "height", "var(--print-footer-height, 0px)");
            setImportant(
              element,
              "min-height",
              "var(--print-footer-height, 0px)"
            );
            setImportant(
              element,
              "max-height",
              "var(--print-footer-height, 0px)"
            );
            setImportant(
              element,
              "margin-top",
              "calc(var(--print-footer-height, 0px) * -1)"
            );
            setImportant(element, "margin-right", "0");
            setImportant(element, "margin-bottom", "0");
            setImportant(element, "margin-left", "0");
            setImportant(element, "padding", "0");
            setImportant(element, "overflow", "visible");
          });
      }

      document.querySelectorAll("#header, .app-layout-footer").forEach((element) => {
        rememberElement(element);
        setImportant(element, "display", "none");
        setImportant(element, "visibility", "hidden");
        setImportant(element, "height", "0");
        setImportant(element, "min-height", "0");
        setImportant(element, "max-height", "0");
        setImportant(element, "overflow", "hidden");
      });

      printInlineFixupsRef.current = nextFixups;
    };

    const handleBeforePrint = () => {
      applyPrintFixups();
    };
    const handleAfterPrint = () => {
      restorePrintFixups();
    };
    const mediaQueryList = window.matchMedia("print");
    const handleMediaChange = (event) => {
      if (event.matches) {
        applyPrintFixups();
        return;
      }

      restorePrintFixups();
    };

    window.addEventListener("beforeprint", handleBeforePrint);
    window.addEventListener("afterprint", handleAfterPrint);

    if (typeof mediaQueryList.addEventListener === "function") {
      mediaQueryList.addEventListener("change", handleMediaChange);
    } else if (typeof mediaQueryList.addListener === "function") {
      mediaQueryList.addListener(handleMediaChange);
    }

    return () => {
      restorePrintFixups();
      window.removeEventListener("beforeprint", handleBeforePrint);
      window.removeEventListener("afterprint", handleAfterPrint);

      if (typeof mediaQueryList.removeEventListener === "function") {
        mediaQueryList.removeEventListener("change", handleMediaChange);
      } else if (typeof mediaQueryList.removeListener === "function") {
        mediaQueryList.removeListener(handleMediaChange);
      }
    };
  }, [viewPage, editorContainerRef, printInlineFixupsRef]);
}
