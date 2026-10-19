const fontStyles = [
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@100..900&family=Noto+Serif+KR:wght@100..900&display=swap',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-square.css',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-gothic.css',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-myeongjo.css',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-square-round.css',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-brush.css',
  'https://hangeul.pstatic.net/hangeul_static/css/nanum-pen.css',
];

export function loadBackgroundFontStyles() {
  const load = () => {
    fontStyles.forEach((href, index) => {
      const id = `dockit-background-font-${index}`;
      if (document.getElementById(id)) return;
      const link = document.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      // Fetch without holding up the screen; apply each font sheet as it arrives.
      link.media = 'print';
      link.onload = () => { link.media = 'all'; link.onload = null; };
      document.head.appendChild(link);
    });
  };
  // Let the initial page finish and paint before starting external requests.
  const afterPaint = () => requestAnimationFrame(() => setTimeout(load, 0));
  if (document.readyState === 'complete') afterPaint();
  else window.addEventListener('load', afterPaint, { once: true });
}
