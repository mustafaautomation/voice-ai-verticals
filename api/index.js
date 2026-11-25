// Vercel entry. Same Fastify app as src/server.ts, built to dist/ first.
import { loadConfig } from "../dist/config.js";
import { openDatabase } from "../dist/db/database.js";
import { buildApp } from "../dist/app.js";
import { seedIfEmpty } from "../dist/seed.js";

let ready;

async function getApp() {
  ready ??= (async () => {
    const config = loadConfig();
    const db = openDatabase(config.databasePath);
    if (config.seedOnBoot) seedIfEmpty(db, new Date());
    const app = await buildApp({ config, db });
    await app.ready();
    return app;
  })();
  return ready;
}

export default async function handler(req, res) {
  const app = await getApp();
  app.server.emit("request", req, res);
}
