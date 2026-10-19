const english = require('../desktop/locales/en.json');

let language = 'ko';
const normalizeLanguage = value => value === 'en' ? 'en' : 'ko';
const knownMessages = new Set([...Object.keys(english), ...Object.values(english)]);
const isLocalizedMessage = message => typeof message === 'string' && knownMessages.has(message);
function setLanguage(value) { language = normalizeLanguage(value); }
function getLanguage() { return language; }
function t(source, ...values) {
  const template = language === 'en' ? english[source] ?? source : source;
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : token
  );
}

module.exports = { t, setLanguage, getLanguage, normalizeLanguage, isLocalizedMessage };
