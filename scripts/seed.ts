import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db/database.js";
import { seedIfEmpty } from "../src/seed.js";

const config = loadConfig();
const db = openDatabase(config.databasePath);
seedIfEmpty(db, new Date());
console.log(`Seeded ${config.databasePath}`);
