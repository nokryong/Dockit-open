import { useI18n } from "../../i18n";
import { useRef, useLayoutEffect } from "react";
import { mountCanonicalFootnoteBody, mountFootnoteProjectionClone } from "../../pagination/render/mountFootnoteProjectionClone";

const FootnoteProjectionContent = ({ editor, projection }) => {
  useI18n();
  const hostRef = useRef(null);
  useLayoutEffect(
    () => (projection.canonical
      ? mountCanonicalFootnoteBody(hostRef.current, projection, {
          editorRoot: editor?.view?.dom
        })
      : mountFootnoteProjectionClone(hostRef.current, projection)),
    [editor, projection]
  );
  return <div ref={hostRef} className="dockit-footnote-screen-projection__clip" />;
};

export default FootnoteProjectionContent;
