import "server-only";

/**
 * Checks the settings a live store needs. Returns findings without ever
 * including secret values, so the result is safe to log.
 *
 * "error": the store can't work correctly (or safely) without fixing it.
 * "warning": a feature is off or a setting is weak, but the store can run.
 */

export type ConfigFinding = { level: "error" | "warning"; key: string; message: string };

type Env = Record<string, string | undefined>;

const set = (v: string | undefined) => Boolean(v && v.trim() && !v.includes("YOUR_PASSWORD"));

export function checkConfig(env: Env = process.env): ConfigFinding[] {
  const findings: ConfigFinding[] = [];
  const add = (level: ConfigFinding["level"], key: string, message: string) => findings.push({ level, key, message });
  const production = env.NODE_ENV === "production";

  // Database
  if (!set(env.DATABASE_URL)) add("error", "DATABASE_URL", "No database is configured.");
  else {
    try {
      const url = new URL(env.DATABASE_URL!);
      if (!/^postgres(ql)?:$/.test(url.protocol)) add("error", "DATABASE_URL", "Must be a postgres:// connection string.");
      if (url.hostname.endsWith("pooler.supabase.com") && url.port === "5432") {
        add("warning", "DATABASE_URL", "Uses Supabase's session pooler (5432); the transaction pooler (6543) suits serverless hosting better.");
      }
    } catch {
      add("error", "DATABASE_URL", "Isn't a valid URL.");
    }
  }

  // Sessions and admin
  if ((env.AUTH_SECRET ?? "").length < 32) add("error", "AUTH_SECRET", "Must be set to at least 32 random characters (customer sign-in is off without it).");
  const adminPassword = env.ADMIN_PASSWORD ?? "";
  if (!adminPassword) add("warning", "ADMIN_PASSWORD", "Not set, so the admin dashboard is turned off.");
  else if (adminPassword.length < 12) add("error", "ADMIN_PASSWORD", "Shorter than 12 characters, so the admin stays turned off.");
  else if (adminPassword.length < 16 || new Set(adminPassword).size < 8) add("warning", "ADMIN_PASSWORD", "Works, but a longer, more varied password is recommended for a live store.");

  // Public URL
  const site = env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!site) add(production ? "error" : "warning", "NEXT_PUBLIC_SITE_URL", "Not set; links in emails, the sitemap and SEO tags will point at localhost.");
  else if (production && !/^https:\/\//.test(site)) add("error", "NEXT_PUBLIC_SITE_URL", "Must start with https:// in production.");
  else if (production && /localhost|127\.0\.0\.1/.test(site)) add("error", "NEXT_PUBLIC_SITE_URL", "Still points at localhost.");

  // Payments
  const keyId = env.RAZORPAY_KEY_ID ?? "";
  const keySecret = env.RAZORPAY_KEY_SECRET ?? "";
  if (!keyId && !keySecret) add("warning", "RAZORPAY_KEY_ID", "Razorpay isn't configured; only cash on delivery is offered.");
  else if (!keyId || !keySecret) add("error", "RAZORPAY_KEY_SECRET", "Razorpay needs both RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  else {
    if (!/^rzp_(test|live)_/.test(keyId)) add("error", "RAZORPAY_KEY_ID", "Doesn't look like a Razorpay key id (rzp_test_… or rzp_live_…).");
    if (keyId.startsWith("rzp_live_") && !production) add("warning", "RAZORPAY_KEY_ID", "LIVE keys outside production: real money will be charged.");
    if (!set(env.RAZORPAY_WEBHOOK_SECRET)) add("warning", "RAZORPAY_WEBHOOK_SECRET", "Not set, so payment notifications can't be verified; orders rely on the browser confirming payment.");
  }

  // Email
  if (!set(env.RESEND_API_KEY) || !set(env.EMAIL_FROM)) {
    add("warning", "RESEND_API_KEY", "Email isn't configured: no order emails, and customers can't receive sign-in codes.");
  }

  // Scheduled job
  if ((env.CRON_SECRET ?? "").length < 16) {
    add("warning", "CRON_SECRET", "Not set (16+ characters); the scheduled clean-up of abandoned payments won't run.");
  }

  return findings;
}

export const hasErrors = (findings: ConfigFinding[]) => findings.some((f) => f.level === "error");
