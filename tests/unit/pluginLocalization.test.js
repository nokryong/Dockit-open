import { expect, it } from 'vitest';
import { localizePlugin } from '../../app/LIB/utils/pluginLocalization';
it('localizes manifest display fields without modifying the installed manifest or identity', () => {
  const source = { id: 'dockit.calendar', name: '달력', description: '일정', widgets: [{ id: 'calendar', title: '달력', entry: 'dist/index.html' }], locales: { en: { name: 'Calendar', widgets: { calendar: 'Calendar' } } } };
  const english = localizePlugin(source, 'en');
  expect(english.name).toBe('Calendar');
  expect(english.description).toBe('일정');
  expect(english.widgets[0].title).toBe('Calendar');
  expect(english.widgets[0].id).toBe('calendar');
  expect(source.name).toBe('달력');
  expect(localizePlugin(source, 'ko')).toBe(source);
});
