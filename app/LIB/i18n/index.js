import { useSyncExternalStore } from "react";
import english from "../../../desktop/locales/en.json";

const listeners = new Set();
let language = "ko";

export const normalizeLanguage = (value) => value === "en" ? "en" : "ko";
// 언어 설정값 (ko, en 외에는 시스템 언어 사용)
export const normalizeLanguagePreference = (value) => value === "ko" || value === "en" ? value : "system";
// 실제 표시 언어 (시스템 언어가 한국어면 한국어, 그 외는 영어)
export const resolveLanguage = (preference, systemLanguage = globalThis.navigator?.language) => {
  const value = normalizeLanguagePreference(preference);
  if (value !== "system") return value;
  return String(systemLanguage || "").toLowerCase().startsWith("ko") ? "ko" : "en";
};
export const getLanguage = () => language;
export const getDateLocale = () => language === "en" ? "en-US" : "ko-KR";

export function setLanguage(value) {
  const next = normalizeLanguage(value);
  if (typeof document !== "undefined") document.documentElement.lang = next;
  if (next === language) return;
  language = next;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useI18n() {
  return useSyncExternalStore(subscribe, getLanguage, getLanguage);
}

export function t(source, ...values) {
  const template = language === "en" ? english[source] ?? source : source;
  return interpolate(template, values);
}

function interpolate(template, values) {
  return template.replace(/\{(\d+)\}/g, (token, index) =>
    Number(index) < values.length ? String(values[Number(index)] ?? "") : token
  );
}

const korean = Object.fromEntries(Object.entries(english).map(([source, translation]) => [translation, source]));
const patterns = {};
export function translateMessage(message) {
  if (typeof message !== "string") return message;
  const dictionary = language === "en" ? english : korean;
  if (Object.hasOwn(dictionary, message)) return dictionary[message];
  patterns[language] ??= Object.keys(dictionary).filter((key) => /\{\d+\}/.test(key)).map((key) => {
    const indices = [];
    const expression = key.split(/(\{\d+\})/g).map((part) => {
      const match = /^\{(\d+)\}$/.exec(part);
      if (match) { indices.push(Number(match[1])); return "([\\s\\S]*?)"; }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    return { output: dictionary[key], indices, expression: new RegExp(`^${expression}$`) };
  });
  for (const { output, indices, expression } of patterns[language]) {
    const match = expression.exec(message);
    if (!match) continue;
    const values = [];
    indices.forEach((index, position) => { values[index] = match[position + 1]; });
    return interpolate(output, values);
  }
  return message;
}
