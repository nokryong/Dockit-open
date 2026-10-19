const { isIP } = require('node:net');
const error = message => Object.assign(new Error(message), { code: 'PluginError' });
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const PERMISSIONS = ['storage', 'network', 'credentials', 'images', 'external'];

function publicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw error('플러그인 주소를 확인해주세요.');
  }
  if (
    typeof value !== 'string' ||
    value.length > 4096 ||
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hash ||
    isIP(url.hostname.replace(/^\[|\]$/g, '')) ||
    !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(url.hostname) ||
    /(?:^|\.)(?:localhost|local|internal|lan|invalid)$/i.test(url.hostname)
  )
    throw error('공개 HTTPS 주소만 사용할 수 있습니다.');
  return url;
}

function allowedUrl(value, origins) {
  const url = publicUrl(value);
  if (!origins?.includes(url.origin)) throw error('플러그인에 허용되지 않은 주소입니다.');
  return url;
}

function validateCapabilities(value) {
  if (value.sdkVersion === 1) return {};
  const permissions = value.permissions || [];
  const result = {};
  for (const [field, permission] of [
    ['imageOrigins', 'images'],
    ['externalOrigins', 'external']
  ]) {
    const origins = value[field] ?? [];
    if (
      !Array.isArray(origins) ||
      origins.length > 16 ||
      (origins.length && !permissions.includes(permission)) ||
      (permissions.includes(permission) && !origins.length)
    )
      throw error('플러그인의 외부 주소 권한을 확인해주세요.');
    if (origins.length)
      result[field] = [
        ...new Set(
          origins.map(origin => {
            const url = publicUrl(origin);
            if (url.pathname !== '/' || url.search) throw error('외부 주소에는 출처만 지정해주세요.');
            return url.origin;
          })
        )
      ];
  }
  const services = value.services ?? {};
  if (!object(services) || Object.keys(services).length > 8) throw error('플러그인 API 목록을 확인해주세요.');
  if (permissions.includes('network') !== Boolean(Object.keys(services).length))
    throw error('API 연결에는 network 권한과 services가 필요합니다.');
  const normalized = {};
  for (const [id, service] of Object.entries(services)) {
    if (
      !/^[a-z][a-z0-9-]{0,63}$/.test(id) ||
      ['constructor', 'prototype'].includes(id) ||
      !object(service) ||
      typeof service.label !== 'string' ||
      !service.label.trim() ||
      service.label.length > 80
    )
      throw error('플러그인 API 정보를 확인해주세요.');
    const url = publicUrl(service.url);
    if (url.search) throw error('API 주소의 쿼리는 요청할 때 지정해주세요.');
    const item = { label: service.label, url: url.href };
    if (service.credential !== undefined) {
      const credential = service.credential;
      if (
        !permissions.includes('credentials') ||
        !object(credential) ||
        !['query', 'header'].includes(credential.in) ||
        !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(credential.name || '') ||
        (credential.in === 'header' &&
          ['host', 'connection', 'content-length', 'transfer-encoding', 'cookie'].includes(
            credential.name.toLowerCase()
          ))
      )
        throw error('API Key 설정을 확인해주세요.');
      const prefix = credential.prefix ?? '';
      if (typeof prefix !== 'string' || prefix.length > 64 || /[^\x20-\x7e]/.test(prefix))
        throw error('API Key 접두사를 확인해주세요.');
      item.credential = { in: credential.in, name: credential.name, prefix };
    }
    normalized[id] = item;
  }
  if (permissions.includes('credentials') && !Object.values(normalized).some(service => service.credential))
    throw error('API Key를 사용할 API를 지정해주세요.');
  if (Object.keys(normalized).length) result.services = normalized;
  return result;
}

module.exports = { PERMISSIONS, publicUrl, allowedUrl, validateCapabilities };
