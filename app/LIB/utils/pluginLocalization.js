export function localizePlugin(plugin, language) {
  const translation = plugin.locales?.[language === 'en' ? 'en' : 'ko'];
  if (!translation) return plugin;
  return {
    ...plugin,
    name: translation.name ?? plugin.name,
    description: translation.description ?? plugin.description,
    widgets: plugin.widgets?.map(widget => ({
      ...widget,
      title: translation.widgets?.[widget.id] ?? widget.title,
    })),
  };
}
