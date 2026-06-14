/**
 * 密钥轮换脚本
 * 用法: npx ts-node scripts/rotate-keys.ts
 *
 * 生成新密钥设为active，旧密钥保留用于验签（30天后清理）
 */
import { db } from "../src/db";
import { encrypt, generateSigningSecret } from "../src/utils/cryptoUtils";

async function main() {
  if (!process.env.ENC_KEY) {
    console.error("[rotate-keys] ENC_KEY not set");
    process.exit(1);
  }

  // 1. 生成新密钥
  const secret = generateSigningSecret();
  const encrypted = encrypt(secret);
  const seq = await db.one(
    "SELECT COUNT(*)::INTEGER + 1 AS next_seq FROM jwt_signing_keys"
  );
  const kid = `k${seq.next_seq}`;

  // 2. 插入新密钥（active）
  await db.none(
    `INSERT INTO jwt_signing_keys (kid, secret_encrypted, is_active)
     VALUES ($[kid], $[secret], true)`,
    { kid, secret: encrypted }
  );

  // 3. 旧密钥标记为非活跃
  await db.none(
    `UPDATE jwt_signing_keys
     SET is_active = false, rotated_at = NOW()
     WHERE is_active = true AND kid != $[kid]`
  );

  // 4. 清理超过90天且已轮换的密钥
  await db.none(
    `DELETE FROM jwt_signing_keys
     WHERE is_active = false
       AND rotated_at < NOW() - INTERVAL '90 days'`
  );

  console.log("================================================================");
  console.log(`  Key rotated: new active key = ${kid}`);
  console.log("  Old keys retained for verification (90-day grace)");
  console.log("================================================================");
  process.exit(0);
}

main().catch((err) => {
  console.error("[rotate-keys] Failed:", err.message);
  process.exit(1);
});
