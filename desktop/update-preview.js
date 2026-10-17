// Development-only UI rehearsal. Never invokes Electron's updater or document writes.
export function previewAppUpdate(setState) {
  let percent = 0;
  const timers = [];
  const show = patch => setState(previous => ({ ...previous, ...patch }));
  show({ status: 'downloading', percent });
  const interval = setInterval(() => {
    percent = Math.min(100, percent + 5);
    show({ percent });
    if (percent < 100) return;
    clearInterval(interval);
    timers.push(setTimeout(() => show({ status: 'saving' }), 500));
    timers.push(setTimeout(() => show({ status: 'installing' }), 2000));
    timers.push(setTimeout(() => show({ status: 'idle', preview: false }), 4000));
  }, 400);
  return () => { clearInterval(interval); timers.forEach(clearTimeout); };
}
