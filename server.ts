import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import { getFinaStatus, syncFinaInventory } from './server/finaClient.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const AUTO_SYNC_INTERVAL_MS = 30_000;

let cachedBcvRate: { rate: number; updatedAt: number } | null = null;

let syncInProgress = false;
let lastSyncAt: string | null = null;
let lastSyncCount: number | null = null;
let lastSyncError: string | null = null;

async function runFinaSync(customEndpoint?: string, userJwt?: string) {
  if (syncInProgress) {
    return {
      synced: lastSyncCount ?? 0,
      source: 'en curso',
      probe: ['Sincronización ya en progreso'],
      skipped: true,
    };
  }

  syncInProgress = true;
  try {
    const result = await syncFinaInventory(customEndpoint, userJwt);
    lastSyncAt = new Date().toISOString();
    lastSyncCount = result.synced;
    lastSyncError = null;
    return result;
  } catch (err) {
    lastSyncError = err instanceof Error ? err.message : 'Error sincronizando con Fina';
    throw err;
  } finally {
    syncInProgress = false;
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/bcv', async (_req, res) => {
    const now = Date.now();
    if (cachedBcvRate && now - cachedBcvRate.updatedAt < 15 * 60 * 1000) {
      return res.json({ rate: cachedBcvRate.rate, cached: true });
    }

    try {
      const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as { promedio?: number | string };
      const rate = parseFloat(String(data.promedio ?? ''));
      if (rate && rate > 0) {
        cachedBcvRate = { rate, updatedAt: now };
        return res.json({ rate, cached: false });
      }
      throw new Error('Invalid BCV rate payload');
    } catch {
      if (cachedBcvRate) {
        return res.json({ rate: cachedBcvRate.rate, cached: true, stale: true });
      }
      return res.status(502).json({ rate: null, error: 'BCV API unavailable' });
    }
  });

  app.get('/api/fina/status', (_req, res) => {
    res.json({
      ...getFinaStatus(),
      autoSyncIntervalSec: AUTO_SYNC_INTERVAL_MS / 1000,
      isSyncing: syncInProgress,
      lastSyncAt,
      lastSyncCount,
      lastSyncError,
    });
  });

  app.post('/api/fina/sync', async (req, res) => {
    try {
      const customEndpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : undefined;
      const authHeader = req.headers.authorization || '';
      const userJwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : undefined;
      const result = await runFinaSync(customEndpoint, userJwt);
      res.json({ ok: true, ...result, lastSyncAt });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error sincronizando con Fina';
      res.status(400).json({ ok: false, error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.use((_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);

    // Sincronización automática cada 30 segundos si Fina está configurado
    const triggerAutoSync = async () => {
      const status = getFinaStatus();
      if (!status.finaConfigured || syncInProgress) return;
      try {
        const res = await runFinaSync();
        console.log(`[AutoSync 30s] Sincronizados ${res.synced} productos desde Fina.`);
      } catch (err) {
        console.warn('[AutoSync 30s] Error:', err instanceof Error ? err.message : err);
      }
    };

    setTimeout(triggerAutoSync, 2500);
    setInterval(triggerAutoSync, AUTO_SYNC_INTERVAL_MS);
  });
}

startServer();
