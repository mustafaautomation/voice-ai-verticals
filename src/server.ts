import { loadConfig } from "./config.js";
import { openDatabase } from "./db/database.js";
import { buildApp } from "./app.js";
import { seedIfEmpty } from "./seed.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
if (config.seedOnBoot) seedIfEmpty(db, new Date());
const app = await buildApp({ config, db });
await app.listen({ port: config.port, host: config.host });
