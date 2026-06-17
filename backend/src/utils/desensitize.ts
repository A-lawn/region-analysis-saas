// Privacy desensitization utility — masks sensitive fields in logs
// Rules are loaded from privacy_rules table (migration 008)

const PRIVACY_PATTERNS: { pattern: RegExp; strategy: string; maskChar: string; keepPrefix: number; keepSuffix: number }[] = [
  { pattern: /^email$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 2, keepSuffix: 3 },
  { pattern: /^phone$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 3, keepSuffix: 4 },
  { pattern: /^id_card$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 4, keepSuffix: 4 },
  { pattern: /^password$/i, strategy: "full_mask", maskChar: "*", keepPrefix: 0, keepSuffix: 0 },
  { pattern: /^address$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 6, keepSuffix: 0 },
  { pattern: /^ip_address$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 3, keepSuffix: 0 },
  { pattern: /^(lat|lng|latitude|longitude)$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 2, keepSuffix: 2 },
  { pattern: /^(name|.*姓名.*|.*contact.*)$/i, strategy: "partial_mask", maskChar: "*", keepPrefix: 1, keepSuffix: 1 },
  { pattern: /^(token|secret|key|jwt)$/i, strategy: "full_mask", maskChar: "*", keepPrefix: 0, keepSuffix: 0 },
];

function applyMask(value: string, strategy: string, maskChar: string, keepPrefix: number, keepSuffix: number): string {
  if (!value) return value;

  switch (strategy) {
    case "full_mask":
      return maskChar.repeat(Math.min(value.length, 20));

    case "partial_mask": {
      if (value.includes("@")) {
        // Email: user@domain.com -> us**@do****.com
        const [user, domain] = value.split("@");
        const maskedUser = user.length <= keepPrefix
          ? maskChar.repeat(user.length)
          : user.substring(0, keepPrefix) + maskChar.repeat(Math.min(user.length - keepPrefix, 8));
        const maskedDomain = domain
          ? domain.substring(0, 2) + maskChar.repeat(Math.min(domain.length - 2, 8))
          : "";
        return maskedUser + "@" + maskedDomain;
      }
      if (/^d{11,18}$/.test(value)) {
        // Phone/ID: show prefix + suffix
        const prefix = value.substring(0, keepPrefix);
        const suffix = value.substring(value.length - keepSuffix);
        return prefix + maskChar.repeat(Math.min(value.length - keepPrefix - keepSuffix, 12)) + suffix;
      }
      // Generic partial mask
      if (value.length <= keepPrefix + keepSuffix) {
        return maskChar.repeat(value.length);
      }
      return value.substring(0, keepPrefix) + maskChar.repeat(Math.min(value.length - keepPrefix - keepSuffix, 15)) + value.substring(value.length - keepSuffix);
    }

    case "hash":
      return "[REDACTED:" + value.length + "chars]";

    default:
      return value;
  }
}

/**
 * Desensitize an object for safe logging.
 * Recursively masks sensitive field values based on key patterns.
 */
export function desensitize(obj: any, depth: number = 0): any {
  if (depth > 5) return "[MAX_DEPTH]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => desensitize(item, depth + 1));
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    const rule = PRIVACY_PATTERNS.find(r => r.pattern.test(key));
    if (rule && typeof value === "string") {
      result[key] = applyMask(value, rule.strategy, rule.maskChar, rule.keepPrefix, rule.keepSuffix);
    } else if (rule && value !== null) {
      result[key] = "[MASKED:" + typeof value + "]";
    } else {
      result[key] = desensitize(value, depth + 1);
    }
  }
  return result;
}

/**
 * Safe stringify with desensitization — for JSON logging.
 */
export function safeStringify(obj: any): string {
  try {
    return JSON.stringify(desensitize(obj));
  } catch {
    return "[UNSERIALIZABLE]";
  }
}
