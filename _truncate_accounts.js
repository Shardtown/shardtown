require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const mysql = require('mysql2/promise');

const TABLES = [
  'account_tokens',
  'account_passkeys',
  'account_personal_tokens',
  'account_login_attempts',
  'accounts',
];

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    multipleStatements: false,
  });

  console.log('BEFORE:');
  for (const t of TABLES) {
    try {
      const [r] = await db.execute(`SELECT COUNT(*) AS c FROM ${t}`);
      console.log(`  ${t}: ${r[0].c}`);
    } catch (e) {
      console.log(`  ${t}: (skip — ${e.code || e.message})`);
    }
  }

  // FK-safe order : children d'abord, parent (accounts) en dernier.
  // On préfère DELETE à TRUNCATE pour respecter d'éventuelles FK ON DELETE.
  for (const t of TABLES) {
    try {
      const [r] = await db.query(`DELETE FROM ${t}`);
      console.log(`DELETE FROM ${t}: ${r.affectedRows} rows`);
    } catch (e) {
      console.log(`DELETE FROM ${t}: FAILED — ${e.code || e.message}`);
    }
  }

  // Reset AUTO_INCREMENT pour que le prochain compte parte à id=1
  for (const t of TABLES) {
    try { await db.execute(`ALTER TABLE ${t} AUTO_INCREMENT = 1`); } catch { /* table sans id */ }
  }

  console.log('AFTER:');
  for (const t of TABLES) {
    try {
      const [r] = await db.execute(`SELECT COUNT(*) AS c FROM ${t}`);
      console.log(`  ${t}: ${r[0].c}`);
    } catch (e) {
      console.log(`  ${t}: (skip — ${e.code || e.message})`);
    }
  }

  await db.end();
})().catch(err => { console.error(err); process.exit(1); });
