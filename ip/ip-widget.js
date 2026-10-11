/*
 * 节点 IP 协议检测 🌐
 *
 * 检测 Egern 当前出口是 IPv4 还是 IPv6，并显示出口 IP：
 *   https://api.ipify.org?format=json   （仅 IPv4 解析）→ v4 出口 IP
 *   https://api6.ipify.org?format=json  （仅 IPv6 解析）→ v6 出口 IP，能通即节点支持 v6
 * 小组件的请求走 Egern 当前分流，看到的就是所选节点的出口 IP。
 *
 * Env:
 *   REFRESH_MINUTES   刷新间隔（分钟），5 ~ 720，默认 5
 */

const V4_API = 'https://api.ipify.org?format=json';
const V6_API = 'https://api6.ipify.org?format=json';
const CACHE_KEY = 'ipcheck_cache';
const TIMEOUT = 10000;

function refreshAfter(ctx) {
  const v = Number(ctx.env && ctx.env.REFRESH_MINUTES);
  const min = Number.isFinite(v) ? Math.min(720, Math.max(5, v)) : 5;
  return new Date(Date.now() + min * 60000).toISOString();
}

function isV4(ip) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
}

function isV6(ip) {
  return ip.includes(':');
}

async function fetchIp(ctx, url) {
  try {
    const resp = await ctx.http.get(url, {
      timeout: TIMEOUT,
      redirect: 'follow',
      headers: { 'User-Agent': 'egern-ipcheck/1.0', Accept: 'application/json' },
    });
    const status = resp.status ?? 200;
    if (status < 200 || status >= 300) return '';
    const text = String(await resp.text()).trim();
    let ip = text;
    try {
      const j = JSON.parse(text);
      if (j && j.ip) ip = String(j.ip).trim();
    } catch (_) { /* 纯文本 IP */ }
    if (isV4(ip) || isV6(ip)) return ip;
    return '';
  } catch (_) {
    return '';
  }
}

async function loadData(ctx) {
  const [v4, v6] = await Promise.all([fetchIp(ctx, V4_API), fetchIp(ctx, V6_API)]);
  if (v4 || v6) {
    const data = { v4, v6, at: Date.now(), cached: false };
    try { ctx.storage.setJSON(CACHE_KEY, data); } catch (_) {}
    return data;
  }
  try {
    const c = ctx.storage.getJSON(CACHE_KEY);
    if (c && (c.v4 || c.v6)) return { v4: c.v4 || '', v6: c.v6 || '', at: c.at || 0, cached: true };
  } catch (_) {}
  return null;
}

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function typeRow(data) {
  const is6 = !!data.v6;
  const color = is6 ? '#30D158' : '#0A84FF';
  const label = is6 ? (data.v4 ? 'IPv6 · 双栈' : 'IPv6') : 'IPv4';
  return {
    type: 'stack',
    direction: 'row',
    alignment: 'center',
    gap: 6,
    children: [
      { type: 'text', text: '●', font: { size: 'title3' }, color },
      { type: 'text', text: label, font: { size: 'title2', weight: 'bold' } },
    ],
  };
}

function ipLines(data) {
  const lines = [];
  if (data.v6) {
    lines.push({ type: 'text', text: `v6  ${data.v6}`, font: { size: 'caption' }, opacity: 0.85, maxLines: 1 });
  }
  if (data.v4) {
    lines.push({ type: 'text', text: `v4  ${data.v4}`, font: { size: 'caption' }, opacity: 0.85, maxLines: 1 });
  }
  return lines;
}

function footer(data) {
  const t = fmtTime(data.at);
  const suffix = data.cached ? '（缓存）' : '';
  if (!t) return null;
  return { type: 'text', text: `检测于 ${t}${suffix}`, font: { size: 'caption2' }, opacity: 0.5 };
}

function buildSmall(ctx, data) {
  const children = [typeRow(data), ...ipLines(data)];
  const f = footer(data);
  if (f) children.push({ type: 'spacer' }, f);
  return {
    type: 'widget',
    padding: 14,
    refreshAfter: refreshAfter(ctx),
    children: [{ type: 'stack', direction: 'column', gap: 5, children }],
  };
}

function buildMedium(ctx, data) {
  const children = [typeRow(data), { type: 'spacer', length: 2 }, ...ipLines(data)];
  const f = footer(data);
  if (f) children.push({ type: 'spacer' }, f);
  return {
    type: 'widget',
    padding: 14,
    refreshAfter: refreshAfter(ctx),
    children: [{ type: 'stack', direction: 'column', gap: 5, children }],
  };
}

function buildLarge(ctx, data) {
  const children = [
    typeRow(data),
    { type: 'spacer', length: 2 },
    ...ipLines(data),
    { type: 'spacer', length: 4 },
    {
      type: 'text',
      text: '小组件请求走 Egern 当前分流，显示的是所选节点的实际出口 IP。IPv6 能通即节点支持 v6。',
      font: { size: 'caption2' },
      opacity: 0.5,
      maxLines: 3,
    },
  ];
  const f = footer(data);
  if (f) children.push({ type: 'spacer' }, f);
  return {
    type: 'widget',
    padding: 16,
    refreshAfter: refreshAfter(ctx),
    children: [{ type: 'stack', direction: 'column', gap: 5, children }],
  };
}

function failWidget(ctx, msg) {
  return {
    type: 'widget',
    padding: 14,
    refreshAfter: refreshAfter(ctx),
    children: [{ type: 'text', text: msg || '🌐 出口检测失败，稍后再试', font: { size: 'footnote' }, opacity: 0.6 }],
  };
}

async function main(ctx) {
  const family = ctx.widgetFamily || 'systemSmall';
  const data = await loadData(ctx);
  if (!data) return failWidget(ctx);

  if (family === 'systemLarge' || family === 'systemExtraLarge') return buildLarge(ctx, data);
  if (family === 'systemMedium') return buildMedium(ctx, data);
  if (family === 'accessoryCircular') return { type: 'text', text: data.v6 ? 'v6' : 'v4' };
  if (family === 'accessoryRectangular' || family === 'accessoryInline') {
    const ip = data.v6 || data.v4;
    return { type: 'text', text: `${data.v6 ? 'IPv6' : 'IPv4'} ${ip}`, maxLines: 1 };
  }
  return buildSmall(ctx, data);
}

if (typeof module !== 'undefined') module.exports = { main };
