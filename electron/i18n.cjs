const english = require('../desktop/locales/en.json');

let language = 'ko';
const normalizeLanguage = value => (value === 'en' ? 'en' : 'ko');
// 실제 표시 언어 (ko, en 외 설정값은 시스템 언어 사용, 시스템 언어가 한국어가 아니면 영어)
const resolveLanguage = (preference, systemLanguage) => {
  if (preference === 'ko' || preference === 'en') return preference;
  return String(systemLanguage || '').toLowerCase().startsWith('ko') ? 'ko' : 'en';
};
const knownMessages = new Set([...Object.keys(english), ...Object.values(english)]);
const isLocalizedMessage = message => typeof message === 'string' && knownMessages.has(message);
function setLanguage(value) {
  language = normalizeLanguage(value);
}
function getLanguage() {
  return language;
}
function t(source, ...values) {
  const template = language === 'en' ? (english[source] ?? source) : source;
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) < values.length ? String(values[Number(index)] ?? '') : token
  );
}

module.exports = { t, setLanguage, getLanguage, normalizeLanguage, resolveLanguage, isLocalizedMessage };
