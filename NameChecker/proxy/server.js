const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = process.env.PORT || 3456;

const RDAP_SERVERS = {
  com: 'https://rdap.verisign.com/com/v1',
  net: 'https://rdap.verisign.com/net/v1',
  org: 'https://rdap.publicinterestregistry.org',
  io: 'https://rdap.nic.io',
  co: 'https://rdap.nic.co',
};

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map();

function getCached(domain) {
  const entry = cache.get(domain);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(domain);
    return null;
  }
  return entry.result;
}

function setCached(domain, result) {
  cache.set(domain, { result, at: Date.now() });
}

function getTld(domain) {
  const parts = domain.toLowerCase().split('.');
  return parts.length >= 2 ? parts[parts.length - 1] : null;
}

const app = express();

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/v1/domain-availability', async (req, res) => {
  const domain = (req.query.domain || '').trim().toLowerCase();
  if (!domain || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(domain)) {
    return res.status(400).json({ available: null, error: 'Invalid domain' });
  }

  const tld = getTld(domain);
  const rdapBase = RDAP_SERVERS[tld];
  if (!rdapBase) {
    return res.status(400).json({ available: null, error: `Unsupported TLD: .${tld}` });
  }

  const cached = getCached(domain);
  if (cached !== null) {
    return res.json(cached);
  }

  const rdapUrl = `${rdapBase}/domain/${domain}`;
  try {
    const rdapRes = await fetch(rdapUrl);
    let result;
    if (rdapRes.status === 404) {
      result = { available: true };
    } else if (rdapRes.ok) {
      result = { available: false };
    } else {
      result = { available: null, error: `Lookup failed (HTTP ${rdapRes.status})` };
    }
    setCached(domain, result);
    res.json(result);
  } catch (err) {
    const result = { available: null, error: 'Lookup failed' };
    res.json(result);
  }
});

const htmlPath = path.join(__dirname, '..', 'nameChecker.html');
app.get('/', (req, res) => {
  if (fs.existsSync(htmlPath)) {
    res.sendFile(htmlPath);
  } else {
    res.status(404).send('nameChecker.html not found');
  }
});

app.listen(PORT, () => {
  console.log(`Domain availability proxy running at http://localhost:${PORT}/`);
});
