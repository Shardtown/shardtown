'use strict';
/**
 * scripts/genkey.js — Génère une clé d'administration Shardtown.
 *
 * Usage :  node scripts/genkey.js [--force]
 *
 *   --force  Révoque toutes les clés actives avant d'en créer une nouvelle.
 *            Sans ce flag, le script refuse si une clé valide existe déjà.
 *
 * La clé est hachée avec Argon2id (memoryCost 64 MiB, timeCost 3, parallelism 4)
 * et stockée dans la table `admin_keys`. Elle expire automatiquement après 14 jours.
 * Elle ne sera jamais affichée une seconde fois — noter la immédiatement.
 */

const crypto = require('crypto');
const path   = require('path');

require('dotenv').config({ path: path.join(__dirname, '../.env') });

const mysql  = require('mysql2/promise');
let   argon2;
try {
    argon2 = require('argon2');
} catch {
    console.error('❌ Le module "argon2" n\'est pas installé.');
    console.error('   Lance : npm install argon2');
    process.exit(1);
}

const FORCE      = process.argv.includes('--force');
const EXPIRE_MS  = 14 * 24 * 60 * 60 * 1000; // 14 jours

// ── Format clé ──────────────────────────────────────────────────────────────
// 32 octets aléatoires (256 bits d'entropie) encodés en hex majuscule,
// préfixés par "SHARD-" et découpés en groupes de 8 pour la lisibilité.
// Exemple : SHARD-A1B2C3D4-E5F60718-293A4B5C-6D7E8F90-A1B2C3D4-E5F60718-293A4B5C-6D7E8F90
function formatKey(buf32) {
    const hex    = buf32.toString('hex').toUpperCase();
    const groups = hex.match(/.{8}/g) ?? [hex];
    return 'SHARD-' + groups.join('-');
}

// ── DB helper ────────────────────────────────────────────────────────────────
async function getPool() {
    const required = ['DB_HOST', 'DB_USER', 'DB_PASS', 'DB_NAME'];
    const missing  = required.filter(k => !process.env[k]);
    if (missing.length) {
        console.error('❌ Variables d\'environnement manquantes :', missing.join(', '));
        process.exit(1);
    }
    return mysql.createPool({
        host:               process.env.DB_HOST,
        user:               process.env.DB_USER,
        password:           process.env.DB_PASS,
        database:           process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit:    2,
    });
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const pool = await getPool();

    // S'assurer que la table existe (idempotent)
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS admin_keys (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            key_hash     VARCHAR(512) NOT NULL,
            label        VARCHAR(128) DEFAULT NULL,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at   DATETIME NOT NULL,
            last_used_at DATETIME DEFAULT NULL,
            revoked      TINYINT NOT NULL DEFAULT 0,
            INDEX idx_active (expires_at, revoked)
        )
    `);

    // Vérifier s'il existe une clé active
    const [existing] = await pool.execute(
        'SELECT id, expires_at FROM admin_keys WHERE revoked = 0 AND expires_at > NOW() LIMIT 1'
    );

    if (existing.length && !FORCE) {
        const exp = new Date(existing[0].expires_at);
        console.error('⚠️  Une clé active existe déjà (expire le ' + exp.toLocaleString('fr-FR') + ').');
        console.error('   Utilise --force pour la révoquer et en créer une nouvelle.');
        await pool.end();
        process.exit(1);
    }

    if (existing.length && FORCE) {
        await pool.execute('UPDATE admin_keys SET revoked = 1 WHERE revoked = 0');
        console.log('⚡ Clés existantes révoquées.');
    }

    // Générer la clé
    const raw       = crypto.randomBytes(32);
    const formatted = formatKey(raw);

    // Hacher avec Argon2id
    console.log('⏳ Hachage Argon2id en cours (quelques secondes)…');
    const hash = await argon2.hash(formatted, {
        type:        argon2.argon2id,
        memoryCost:  65536,  // 64 MiB
        timeCost:    3,
        parallelism: 4,
    });

    // Stocker en base
    const expiresAt = new Date(Date.now() + EXPIRE_MS);
    const expiresSQL = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

    await pool.execute(
        'INSERT INTO admin_keys (key_hash, expires_at) VALUES (?, ?)',
        [hash, expiresSQL]
    );

    await pool.end();

    // ── Affichage ────────────────────────────────────────────────────────────
    const expStr = expiresAt.toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    console.log('\n' + '═'.repeat(78));
    console.log('  CLÉ D\'ADMINISTRATION SHARDTOWN');
    console.log('═'.repeat(78));
    console.log('');
    console.log('  ' + formatted);
    console.log('');
    console.log('  Expire le  : ' + expStr);
    console.log('  Validité   : 14 jours');
    console.log('  Algorithme : Argon2id (64 MiB · 3 iterations · 4 threads)');
    console.log('');
    console.log('  ATTENTION : cette clé ne sera plus jamais affichée.');
    console.log('  Copie-la maintenant dans un gestionnaire de mots de passe.');
    console.log('  Ne pas stocker dans git, email, ou chat.');
    console.log('');
    console.log('  Pour renouveler avant expiration :');
    console.log('    node scripts/genkey.js --force');
    console.log('');
    console.log('═'.repeat(78) + '\n');
}

main().catch(err => {
    console.error('❌ Erreur fatale :', err.message);
    process.exit(1);
});
