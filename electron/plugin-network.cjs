const https = require('node:https');
const dns = require('node:dns');
const { isIP } = require('node:net');

function isPublicAddress(address) {
  if (isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) || (a === 198 && [18, 19].includes(b)));
  }
  return isIP(address) === 6 && /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
}

function publicLookup(hostname, options, callback) {
  dns.lookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(new Error('비공개 네트워크에는 연결할 수 없습니다.'));
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}

function requestPublic(url, { headers = {}, limit, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers, lookup: publicLookup }, response => {
      if (Number(response.headers['content-length']) > limit) { response.destroy(); reject(new Error('응답 크기가 너무 큽니다.')); return; }
      let length = 0;
      const chunks = [];
      response.on('data', chunk => {
        length += chunk.length;
        if (length > limit) { response.destroy(new Error('응답 크기가 너무 큽니다.')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, bytes: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    const timer = setTimeout(() => request.destroy(new Error('요청 시간이 초과되었습니다.')), timeout);
    request.on('close', () => clearTimeout(timer));
    request.on('error', reject);
  });
}

module.exports = { requestPublic, isPublicAddress };
