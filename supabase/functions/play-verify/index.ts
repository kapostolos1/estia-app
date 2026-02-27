import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type VerifyReq = {
  purchaseToken: string;
  productId: string; // "estia_monthly"
  kind: "subscription";
  packageName?: string; // default com.estiaapp.appointments
};

function json(status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

// ✅ CORS (safe)
const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
};

function base64UrlEncode(str: string) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getGoogleAccessToken(serviceAccountJson: string) {
  const sa = JSON.parse(serviceAccountJson);

  console.log("✅ SA EMAIL:", sa.client_email)
  console.log("✅ SA PROJECT:", sa.project_id)
  const clientEmail = sa.client_email as string;
  const privateKey = sa.private_key as string;

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 60 * 60,
  };

  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;

  const keyPem = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");

  const keyDer = Uint8Array.from(atob(keyPem), (c) => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    keyDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  const sigB64Url = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  const assertion = `${unsigned}.${sigB64Url}`;

  const form = new URLSearchParams();
  form.set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  form.set("assertion", assertion);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Google token error: ${res.status} ${JSON.stringify(data)}`);
  return data.access_token as string;
}

async function fetchSubscriptionFromGoogle(params: {
  accessToken: string;
  packageName: string;
  purchaseToken: string;
  // subscriptionId προαιρετικό πια (δεν χρησιμοποιείται στο URL)
  subscriptionId?: string;
}) {
  const { accessToken, packageName, purchaseToken, subscriptionId } = params;

  const url =
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/` +
    `${encodeURIComponent(packageName)}` +
    `/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;

  console.log("📦 google v2 url:", url);
  if (subscriptionId) console.log("🧾 expected subscriptionId:", subscriptionId);

  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });

  const text = await res.text();
  let body: any = null;

  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  // χρήσιμο debug όταν αποτυγχάνει
  console.log("📨 google v2 status:", res.status);
  if (!res.ok) {
    console.log("❌ google v2 error body:", body);
  } else {
    console.log("✅ google v2 ok (keys):", Object.keys(body || {}));
  }

  return { ok: res.ok, status: res.status, body };
}

function parseExpiryMillisFromV2(body: any): number | null {
  const items = Array.isArray(body?.lineItems) ? body.lineItems : [];
  const expiryIso = items?.[0]?.expiryTime; // π.χ. "2026-02-21T12:34:56.000Z"

  if (!expiryIso) return null;

  const ms = Date.parse(expiryIso);
  return Number.isFinite(ms) ? ms : null;
}

// Ελέγχουμε "active" από status ή expiryTime
function isActiveFromGoogleV2(body: any): boolean {
  // Αν σου έρθει status τύπου "SUBSCRIPTION_STATE_ACTIVE"
  const state = body?.subscriptionState || body?.state;

  if (typeof state === "string" && state.toLowerCase().includes("active")) {
    return true;
  }

  const exp = parseExpiryMillisFromV2(body);
  return !!exp && exp > Date.now();
}

serve(async (req) => {
  // ✅ Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    if (req.method !== "POST") return json(405, { error: "Use POST" }, CORS_HEADERS);

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const GOOGLE_SERVICE_ACCOUNT_JSON = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_JSON");
    const DEFAULT_PACKAGE = "com.estiaapp.appointments";

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY || !GOOGLE_SERVICE_ACCOUNT_JSON) {
      return json(500, { error: "Missing env vars" }, CORS_HEADERS);
    }

    // ✅ Case-insensitive auth header
    const auth =
      req.headers.get("authorization") ||
      req.headers.get("Authorization") ||
      "";

    if (!auth.startsWith("Bearer ")) {
      return json(401, { error: "Missing Authorization Bearer token" }, CORS_HEADERS);
    }

    console.log("play-verify: start");

    // 1) ✅ Logged-in user (anon + bearer)
    const supaUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: auth } },
    });

    const { data: userData, error: userErr } = await supaUser.auth.getUser();
    console.log("👤 USER:", userData?.user?.id);
    if (userErr || !userData?.user?.id) {
      console.log("play-verify: invalid session", userErr?.message);
      return json(401, { error: "Invalid session" }, CORS_HEADERS);
    }
    const userId = userData.user.id;

    // 2) ✅ Body
    let bodyReq: VerifyReq;
    try {
      bodyReq = (await req.json()) as VerifyReq;
    console.log("🚀 play-verify CALLED")  
    } catch {
      return json(400, { error: "Invalid JSON body" }, CORS_HEADERS);
    }

    const purchaseToken = String(bodyReq?.purchaseToken || "").trim();
    const productId = String(bodyReq?.productId || "").trim();
    const kind = bodyReq?.kind;
    const packageName = String(bodyReq?.packageName || DEFAULT_PACKAGE).trim();
    console.log("DBG packageName:", packageName);
    console.log("DBG productId:", productId);
    console.log("DBG kind:", kind);
    console.log("DBG purchaseToken_prefix:", purchaseToken.slice(0, 10), "len:", purchaseToken.length);
    if (kind !== "subscription") return json(400, { error: "kind must be 'subscription'" }, CORS_HEADERS);
    if (!purchaseToken || !productId) return json(400, { error: "Missing purchaseToken or productId" }, CORS_HEADERS);

    // 3) ✅ business_id + role από profiles
    const { data: prof, error: profErr } = await supaUser
      .from("profiles")
      .select("business_id, role")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      console.log("play-verify: profiles read failed", profErr.message);
      return json(500, { error: "profiles read failed", details: profErr.message }, CORS_HEADERS);
    }
    if (!prof?.business_id) {
      return json(400, { error: "User has no business_id (profiles.business_id is null)" }, CORS_HEADERS);
    }

    const businessId = prof.business_id as string;
    const role = String(prof.role || "").toLowerCase();

    // ✅ ΜΟΝΟ Ο OWNER ΠΛΗΡΩΝΕΙ
    if (role !== "owner") {
      return json(403, { error: "Only owner can verify/activate subscription" }, CORS_HEADERS);
    }

    // 4) ✅ Google verify
    console.log("play-verify: google verify start");
    const accessToken = await getGoogleAccessToken(GOOGLE_SERVICE_ACCOUNT_JSON);

    const googleRes = await fetchSubscriptionFromGoogle({
      accessToken,
      packageName,
      subscriptionId: productId,
      purchaseToken,
    });

    if (!googleRes.ok) {
      console.log("play-verify: google verify failed", googleRes.status, JSON.stringify(googleRes.body));
      return json(
        400,
        {
          error: "Google verify failed",
          googleStatus: googleRes.status,
          googleBody: googleRes.body,
        },
        CORS_HEADERS
      );
    }

    const expiryMillis = parseExpiryMillisFromV2(googleRes.body);
    if (!expiryMillis) {
      return json(
        400,
        { error: "Google response missing expiryTimeMillis", googleBody: googleRes.body },
        CORS_HEADERS
      );
    }

    const active = isActiveFromGoogleV2(googleRes.body);
    const expiresAtIso = new Date(expiryMillis).toISOString();
    const orderId = (googleRes.body?.orderId ?? null) as string | null;

    // 5) ✅ DB writes with service role (bypass RLS)
    const supaAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // ✅ ΠΑΝΤΑ owner_id από businesses
    const { data: biz, error: bizErr } = await supaAdmin
      .from("businesses")
      .select("owner_id")
      .eq("id", businessId)
      .single();

    if (bizErr || !biz?.owner_id) {
      console.log("play-verify: cannot resolve business owner", bizErr?.message);
      return json(500, { error: "Cannot resolve business owner", details: bizErr?.message }, CORS_HEADERS);
    }
    const ownerId = biz.owner_id as string;

    // ✅ Διάβασε τρέχον paid_until για να ΜΗΝ γίνει downgrade
    const { data: existingSub, error: exErr } = await supaAdmin
      .from("subscriptions")
      .select("paid_until")
      .eq("business_id", businessId)
      .maybeSingle();

    if (exErr) {
      console.log("play-verify: subscriptions read failed", exErr.message);
      return json(500, { error: "subscriptions read failed", details: exErr.message }, CORS_HEADERS);
    }

    const existingPaidMs = existingSub?.paid_until ? new Date(existingSub.paid_until).getTime() : null;
    const newPaidMs = expiryMillis;

    const shouldUpdatePaidUntil =
      active === true && (existingPaidMs == null || newPaidMs > existingPaidMs);

    console.log("play-verify:", {
      businessId,
      active,
      existingPaidMs,
      newPaidMs,
      shouldUpdatePaidUntil,
    });

    if (shouldUpdatePaidUntil) {
      const { data, error: subErr } = await supaAdmin
        .from("subscriptions")
        .update(
          {
            paid_until: expiresAtIso,
            provider: "googleplay",
            updated_at: new Date().toISOString(),
          })
          .eq("business_id", businessId)
          .select("business_id, paid_until");

        console.log("play-verify: update affected rows:", data?.length ?? 0, "paid_until:", data?.[0]?.paid_until);
      if (subErr) {
        console.log("play-verify: subscriptions update failed", subErr.message);
        return json(500, { error: "subscriptions update failed", details: subErr.message });
      }
    } else {
      const { error: touchErr } = await supaAdmin
        .from("subscriptions")
        .update(
          {
            provider: "googleplay",
            updated_at: new Date().toISOString(),
          })
          .eq("business_id", businessId);

      if (touchErr) {
        console.log("play-verify: subscriptions touch failed", touchErr.message);
        return json(500, { error: "subscriptions touch failed", details: touchErr.message }, CORS_HEADERS);
      }
    }

    // 5b) ✅ Log purchase (δεν μπλοκάρει activation)
    try {
      const { error: purErr } = await supaAdmin.from("play_purchases").insert({
        business_id: businessId,
        user_id: userId,
        product_id: productId,
        purchase_token: purchaseToken,
        order_id: orderId,
        expires_at: expiresAtIso,
        raw: googleRes.body,
      });

      if (purErr) console.log("WARN: play_purchases insert failed:", purErr.message);
    } catch (e) {
      console.log("WARN: play_purchases insert exception:", String((e as any)?.message || e));
    }

    console.log("play-verify: ok");

    return json(
      200,
      {
        ok: true,
        active,
        updated: shouldUpdatePaidUntil,
        business_id: businessId,
        paid_until: shouldUpdatePaidUntil ? expiresAtIso : existingSub?.paid_until ?? null,
        expiryMillis,
      },
      CORS_HEADERS
    );
  } catch (e) {
    console.log("play-verify: unhandled", String((e as any)?.message || e));
    return json(500, { error: "Unhandled error", details: String((e as any)?.message || e) }, CORS_HEADERS);
  }
});


