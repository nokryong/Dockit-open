import { useEffect, useMemo, useState } from 'react';
import { fontOptions } from '../constant/fontOptions';
import FontOptionPreview from '../components/common/FontOptionPreview';
import { getLocalFontOptions, includeSelectedFont, loadLocalFonts } from '../utils/localFonts';
import { sortFontOptions } from '../utils/sortFontOptions';
import { useI18n } from '../i18n';

const providedNames = new Set(fontOptions.map(option => option.value));

export function useDocumentFontOptions(selectedFont) {
  const language = useI18n();
  const [localFonts, setLocalFonts] = useState(getLocalFontOptions);
  useEffect(() => {
    let active = true;
    loadLocalFonts().then(fonts => { if (active) setLocalFonts(fonts); }).catch(() => {});
    return () => { active = false; };
  }, []);

  const options = useMemo(() => { void language; return sortFontOptions([
    ...fontOptions,
    ...localFonts.filter(font => !providedNames.has(font.value)),
  ].map(font => ({
    ...font,
    content: <FontOptionPreview label={font.label} fontFamily={font.fontFamily || font.value} />,
  }))); }, [localFonts, language]);

  return useMemo(() => includeSelectedFont(options, selectedFont), [options, selectedFont]);
}
