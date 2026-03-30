function toSafeString(value, max = 2000) {
  if (value === undefined || value === null) return '';
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  return str.length > max ? `${str.slice(0, max)}...(truncated)` : str;
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object') return undefined;
  try {
    const serialized = JSON.stringify(meta);
    const trimmed =
      serialized.length > 8000
        ? `${serialized.slice(0, 8000)}...(truncated)`
        : serialized;
    return JSON.parse(trimmed);
  } catch {
    return { value: toSafeString(meta) };
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const incident = {
    id: toSafeString(body.id, 80),
    at: toSafeString(body.at, 80),
    level: toSafeString(body.level, 20),
    event: toSafeString(body.event, 120),
    message: toSafeString(body.message, 500),
    meta: sanitizeMeta(body.meta),
    app: body.app && typeof body.app === 'object' ? body.app : {},
  };

  const requestContext = {
    ip:
      req.headers['x-forwarded-for'] ||
      req.headers['x-real-ip'] ||
      req.socket?.remoteAddress ||
      null,
    userAgent: req.headers['user-agent'] || null,
    referer: req.headers.referer || null,
    host: req.headers.host || null,
    timestamp: new Date().toISOString(),
  };

  // Visible in Vercel Function Logs.
  console.log('[SYNC_INCIDENT]', JSON.stringify({ incident, requestContext }));

  return res.status(200).json({ ok: true });
}
