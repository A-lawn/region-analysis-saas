/**
 * 密钥初始化脚本
 * 用法: npx ts-node scripts/init-keys.ts
 *
 * 生成 ENC_KEY + 首个JWT签名密钥并入库
 */
import crypto from "crypto";
import { db } from "../src/db";
import { encrypt, generateSigningSecret } from "../src/utils/cryptoUtils";

async function main() {
  // 1. 检查是否已有密钥
  const existing = await db.oneOrNone(
    "SELECT COUNT(*)::INTEGER AS cnt FROM jwt_signing_keys"
  );

  if (existing?.cnt > 0) {
    console.log(`[init-keys] Already have ${existing.cnt} signing key(s), skipping.`);
    console.log("[init-keys] To rotate keys, use: npx ts-node scripts/rotate-keys.ts");
    process.exit(0);
  }

  // 2. 检查 ENC_KEY
  if (!process.env.ENC_KEY) {
    const encKey = crypto.randomBytes(32).toString("base64");
    console.log("================================================================");
    console.log("  ENC_KEY not set. Add this to your .env file:");
    console.log(`  ENC_KEY=${encKey}`);
    console.log("================================================================");
    console.log("[init-keys] Set ENC_KEY and rerun.");
    process.exit(1);
  }

  // 3. 生成首个JWT签名密钥
  const secret = generateSigningSecret();
  const encrypted = encrypt(secret);
  const kid = `k1`;

  await db.none(
    `INSERT INTO jwt_signing_keys (kid, secret_encrypted)
     VALUES ($[kid], $[secret])`,
    { kid, secret: encrypted }
  );

  console.log("================================================================");
  console.log(`  JWT signing key initialized (kid=${kid})`);
  console.log("  Secret stored encrypted in jwt_signing_keys table");
  console.log("================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("[init-keys] Failed:", err.message);
  process.exit(1);
});
