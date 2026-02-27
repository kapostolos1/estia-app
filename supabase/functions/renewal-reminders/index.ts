import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Env
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM = Deno.env.get("SENDGRID_FROM")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string) {
  return (s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function computeEndsAt(trialEndsAt: string | null, paidUntil: string | null) {
  const t = trialEndsAt ? new Date(trialEndsAt).getTime() : -Infinity;
  const p = paidUntil ? new Date(paidUntil).getTime() : -Infinity;
  return new Date(Math.max(t, p)).toISOString();
}

function hhmmLeft(endsAtIso: string) {
  const ends = new Date(endsAtIso).getTime();
  const now = Date.now();
  const ms = ends - now;
  const mins = Math.max(0, Math.floor(ms / 60000));
  const hh = Math.floor(mins / 60);
  const mm = mins % 60;
  return { hh, mm };
}

async function sendEmail(to: string, businessName: string, endsAtIso: string) {
  const { hh, mm } = hhmmLeft(endsAtIso);

  const subject = "Υπενθύμιση: Η συνδρομή σας λήγει σύντομα";

  const safeName = escapeHtml(businessName);
  const text =
    `Υπενθύμιση ανανέωσης\n` +
    `${businessName}\n` +
    `Η συνδρομή λήγει σε περίπου ${hh} ώρες ${mm} λεπτά.\n` +
    `Ανοίξτε την εφαρμογή για ανανέωση.\n`;

  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5">
      <h2>Υπενθύμιση ανανέωσης</h2>
      <p><b>${safeName}</b></p>
      <p>Η συνδρομή λήγει σε περίπου <b>${hh} ώρες ${mm} λεπτά</b>.</p>
      <p>Ανοίξτε την εφαρμογή για ανανέωση.</p>
    </div>
  `;

  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SENDGRID_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: SENDGRID_FROM, name: "Estia" },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html },
      ],
    }),
  });

  // SendGrid: 202 Accepted = OK
  if (!(r.status === 202 || r.ok)) {
    const body = await r.text().catch(() => "");
    throw new Error(`SendGrid error: status=${r.status} body=${body}`);
  }
}

serve(async (req) => {
  try {
    // ✅ AUTH: δέχεται και X-Cron-Secret και Bearer CRON_SECRET
    const cronHeader = (req.headers.get("x-cron-secret") || "").trim();
    const auth = (req.headers.get("authorization") || "").trim();

    const ok = cronHeader === CRON_SECRET || auth === `Bearer ${CRON_SECRET}`;

    // (προαιρετικό debug)
    if (!ok) {
      return json(
        {
          ok: false,
          error: "unauthorized",
          hint: "Send X-Cron-Secret or Authorization: Bearer <CRON_SECRET>",
          debug: {
            gotCron: req.headers.get("x-cron-secret") || null,
            gotAuth: req.headers.get("authorization") || null,
            expectedCron: `len:${CRON_SECRET.length}`,
          },
        },
        401
      );
    }

    // window 23h–25h από τώρα
    const now = Date.now();
    const from = new Date(now + 23 * 3600 * 1000).toISOString();
    const to = new Date(now + 25 * 3600 * 1000).toISOString();

    // 1) subscriptions + business name
    const { data: subs, error: es } = await supabase
      .from("subscriptions")
      .select(
        `
        business_id,
        owner_id,
        trial_ends_at,
        paid_until,
        renewal_reminder_24h_sent_for_ends_at,
        businesses(name)
      `
      );

    if (es) throw es;

    // 2) owner emails από profiles
    const ownerIds = Array.from(
      new Set((subs || []).map((r: any) => r.owner_id).filter(Boolean))
    );

    const emailByOwner = new Map<string, string>();

    if (ownerIds.length > 0) {
      const { data: owners, error: eo } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", ownerIds);

      if (eo) throw eo;

      for (const o of owners || []) {
        if (o?.id && o?.email) emailByOwner.set(o.id, o.email);
      }
    }

    let candidates = 0;
    let sent = 0;
    const debug: any[] = [];

    for (const row of subs || []) {
      const businessName = (row as any).businesses?.name || "Η επιχείρησή σας";
      const ownerId = (row as any).owner_id;
      const ownerEmail = emailByOwner.get(ownerId);

      if (!ownerEmail) continue;

      const endsAt = computeEndsAt((row as any).trial_ends_at, (row as any).paid_until);

      // μέσα στο 23h–25h
      if (endsAt < from || endsAt > to) continue;
      candidates += 1;

      // idempotency
      if ((row as any).renewal_reminder_24h_sent_for_ends_at === endsAt) continue;

      await sendEmail(ownerEmail, businessName, endsAt);

      const { error: e2 } = await supabase
        .from("subscriptions")
        .update({
          renewal_reminder_24h_sent_at: new Date().toISOString(),
          renewal_reminder_24h_sent_for_ends_at: endsAt,
        })
        .eq("business_id", (row as any).business_id);

      if (e2) throw e2;

      sent += 1;
      debug.push({ business_id: (row as any).business_id, to: ownerEmail, endsAt });
    }

    return json({ ok: true, candidates, sent, debug });
  } catch (e) {
    return json({ ok: false, error: String((e as any)?.message || e) }, 500);
  }
});






