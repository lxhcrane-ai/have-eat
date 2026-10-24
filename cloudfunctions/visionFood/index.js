const cloud = require('wx-server-sdk');
const https = require('https');
const { URL } = require('url');
const vision = require('./lib/vision.js');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 餐食拍照识别：小程序端只传 fileId，图片与 API key 都不出云函数。
// 环境变量（云开发控制台 → 云函数 → 配置）：
//   VISION_BASE_URL  例如 https://dashscope.aliyuncs.com/compatible-mode/v1
//   VISION_MODEL     例如 qwen-vl-max / glm-4v / doubao-vision-pro
//   VISION_API_KEY   供应商 key（不要写进小程序代码）
// 兼容 OpenAI /chat/completions 的视觉接口。

const DAILY_LIMIT = 30;
const MAX_BYTES = 6 * 1024 * 1024;
const TIMEOUT_MS = 25000;

function cfg() {
  return {
    baseUrl: (process.env.VISION_BASE_URL || '').replace(/\/+$/, ''),
    model: process.env.VISION_MODEL || '',
    key: process.env.VISION_API_KEY || ''
  };
}

function pad(n) { return n < 10 ? '0' + n : '' + n; }
function todayStr() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

function postJson(urlStr, headers, body, timeoutMs) {
  return new Promise(function (resolve, reject) {
    let u;
    try { u = new URL(urlStr); } catch (e) { return reject({ kind: 'config', error: 'VISION_BASE_URL 不是合法 URL' }); }
    const payload = Buffer.from(JSON.stringify(body));
    const req = https.request({
      hostname: u.hostname,
      port: u.port || 443,
      path: u.pathname + (u.search || ''),
      method: 'POST',
      headers: Object.assign({
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }, headers)
    }, function (res) {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, json: json, raw: data.slice(0, 800) });
      });
    });
    req.on('error', function (e) { reject({ kind: 'network', error: e.message }); });
    req.setTimeout(timeoutMs, function () {
      req.destroy();
      reject({ kind: 'timeout', error: '视觉模型响应超时' });
    });
    req.write(payload);
    req.end();
  });
}

function pickContent(json) {
  if (!json || !json.choices || !json.choices.length) return null;
  const c = json.choices[0].message && json.choices[0].message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map(function (part) { return typeof part === 'string' ? part : (part.text || ''); }).join('\n');
  }
  return null;
}

async function callModel(messages) {
  const c = cfg();
  const url = c.baseUrl + '/chat/completions';
  const body = {
    model: c.model,
    messages: messages,
    temperature: 0.1,
    max_tokens: 900
  };
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await postJson(url, { Authorization: 'Bearer ' + c.key }, body, TIMEOUT_MS);
      if (res.status === 200 && res.json) return { ok: true, content: pickContent(res.json), json: res.json };
      if (res.status === 401 || res.status === 403) return { ok: false, reason: 'auth', error: '视觉模型鉴权失败（检查 VISION_API_KEY）', status: res.status };
      if (res.status === 429) return { ok: false, reason: 'rate', error: '视觉模型限流，稍后再试', status: res.status };
      if (res.status >= 500 && attempt === 0) { lastErr = { reason: 'upstream', error: '服务端 ' + res.status }; continue; }
      return { ok: false, reason: 'upstream', error: '视觉模型返回 ' + res.status, status: res.status, detail: res.raw };
    } catch (e) {
      if (e.kind === 'timeout') return { ok: false, reason: 'timeout', error: e.error };
      if (e.kind === 'config') return { ok: false, reason: 'not_configured', error: e.error };
      if (attempt === 0) { lastErr = { reason: 'network', error: e.error }; continue; }
      return { ok: false, reason: 'network', error: e.error };
    }
  }
  return { ok: false, reason: (lastErr && lastErr.reason) || 'upstream', error: (lastErr && lastErr.error) || '调用失败' };
}

async function quota(openid) {
  const today = todayStr();
  try {
    const r = await db.collection('users').where({ _openid: openid }).limit(1).get();
    const u = r.data[0];
    if (!u) return { ok: false, error: '需要先在小程序里完成档案初始化' };
    const used = (u.visionDate === today) ? (u.visionCalls || 0) : 0;
    if (used >= DAILY_LIMIT) return { ok: false, error: '今天识别次数已用完（' + DAILY_LIMIT + ' 次/天）' };
    return { ok: true, docId: u._id, used: used, today: today };
  } catch (e) {
    return { ok: true, docId: null, used: 0, today: today };  // 集合异常时不阻塞主流程
  }
}

async function bumpQuota(q, openid) {
  if (!q.docId) return;
  try {
    await db.collection('users').doc(q.docId).update({
      data: { visionDate: q.today, visionCalls: q.used + 1 }
    });
  } catch (e) { /* 计数失败不影响识别结果 */ }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  const c = cfg();

  // 前端可先问一句"是否配置"，避免每张照片都白试一次
  if (event.action === 'status') {
    return {
      ok: true,
      configured: !!(c.baseUrl && c.model && c.key),
      model: c.model || '',
      disclaimer: vision.DISCLAIMER
    };
  }

  if (!c.baseUrl || !c.model || !c.key) {
    return {
      ok: false, reason: 'not_configured',
      error: '视觉模型未配置：在云函数 visionFood 的环境变量里填 VISION_BASE_URL / VISION_MODEL / VISION_API_KEY',
      disclaimer: vision.DISCLAIMER
    };
  }

  const fileId = event.fileId;
  if (!fileId || String(fileId).indexOf('cloud://') !== 0) {
    return { ok: false, reason: 'bad_request', error: '缺少 fileId（需要先上传到云存储）' };
  }

  const q = await quota(OPENID);
  if (!q.ok) return { ok: false, reason: 'quota', error: q.error };

  let file;
  try {
    file = await cloud.downloadFile({ fileID: fileId });
  } catch (e) {
    return { ok: false, reason: 'file', error: '读取照片失败（fileId 无效或已删除）' };
  }
  const buf = file && file.fileContent;
  if (!buf || !buf.length) return { ok: false, reason: 'file', error: '照片内容为空' };
  if (buf.length > MAX_BYTES) {
    return { ok: false, reason: 'too_large', error: '照片超过 ' + Math.round(MAX_BYTES / 1024 / 1024) + 'MB，请压缩后再拍' };
  }

  const mime = (event.mime || 'image/jpeg').indexOf('image/') === 0 ? event.mime : 'image/jpeg';
  const dataUrl = 'data:' + mime + ';base64,' + buf.toString('base64');

  const messages = vision.buildMessages(dataUrl, event.hint || '');
  const res = await callModel(messages);
  if (!res.ok) return Object.assign({ disclaimer: vision.DISCLAIMER }, res);

  const parsed = vision.normalizeVisionResult(res.content);
  await bumpQuota(q, OPENID);

  if (!parsed.ok) {
    return {
      ok: false,
      reason: parsed.reason,
      error: parsed.error,
      rawSnippet: (res.content || '').slice(0, 200),
      disclaimer: vision.DISCLAIMER
    };
  }

  return {
    ok: true,
    items: parsed.items,
    warnings: parsed.warnings,
    note: parsed.note,
    totalKcal: parsed.totalKcal,
    provider: { baseUrl: c.baseUrl, model: c.model },
    disclaimer: vision.DISCLAIMER
  };
};
