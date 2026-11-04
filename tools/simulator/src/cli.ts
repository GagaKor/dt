import { parseArgs } from 'node:util';
import { ingest } from './api';
import { configFile, readConfig, writeConfig } from './config';
import { loadTest } from './load';
import { seed } from './seed';
import { createScenarioState, scenarioTick } from './scenarios';

const USAGE = `usage: pnpm sim <seed|run|load> [--url URL] [--config FILE]
  seed                  create site, model, floors, devices and an integration key; writes .sim.json
  run [--seconds N] [--people 6]   send scenario messages once per second (N omitted: until Ctrl+C)
  load [--seconds 30]   500 positions/s + 20 events/s, prints latency percentiles`;

async function main(): Promise<number> {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: 'string' },
      config: { type: 'string' },
      seconds: { type: 'string' },
      people: { type: 'string' },
    },
  });
  const [command] = positionals;
  const file = configFile(values.config);
  const num = (v: string | undefined, d: number | undefined) => {
    if (v === undefined) return d;
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`invalid number: ${v}`);
    return n;
  };

  if (command === 'seed') {
    const url = values.url ?? process.env.DT_URL ?? 'http://localhost:8080';
    const password = process.env.ADMIN_PASSWORD;
    if (!password) throw new Error('ADMIN_PASSWORD is required');
    const cfg = await seed(url, process.env.ADMIN_USERNAME ?? 'admin', password);
    writeConfig(file, cfg);
    console.log(`[seed] wrote ${file}`);
    console.log(`[seed] monitor: ${url}/sites/${cfg.siteId}/monitor`);
    return 0;
  }

  if (command === 'run' || command === 'load') {
    const cfg = readConfig(file);
    if (values.url) cfg.url = values.url;
    const seconds = num(values.seconds, command === 'load' ? 30 : undefined);
    if (command === 'load') return loadTest(cfg, seconds!);

    const state = createScenarioState({
      people: num(values.people, 6),
      devices: cfg.devices,
    });
    console.log(`[run] ${state.people} people, scenario ${state.scenario}`);
    let failures = 0;
    for (let tick = 0; seconds === undefined || tick <= seconds; tick++) {
      const t0 = Date.now();
      const { positions, events } = scenarioTick(state, tick * 1000);
      const results = await Promise.all([
        ingest(cfg.url, cfg.key, '/api/ingest/positions', positions),
        ...events.map((e) => ingest(cfg.url, cfg.key, '/api/ingest/events', e)),
      ]);
      const bad = results.filter((r) => r.status < 200 || r.status >= 300);
      failures += bad.length;
      if (bad.length)
        console.error(`[run] t=${tick}s failed: ${bad.map((r) => r.status).join(',')}`);
      if (events.length)
        console.log(`[run] t=${tick}s events: ${events.map((e) => e.eventType).join(', ')}`);
      const wait = 1000 - (Date.now() - t0);
      if (wait > 0 && (seconds === undefined || tick < seconds))
        await new Promise((r) => setTimeout(r, wait));
    }
    return failures === 0 ? 0 : 1;
  }

  console.error(USAGE);
  return command ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  },
);
