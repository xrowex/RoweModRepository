export const onRequestPost: PagesFunction<{ DB: D1Database }> = async (ctx) => {
  const body = await ctx.request.json();
  const { slug, version, title, description, r2_key, file_size, sha256, changelog, slot } = body;

  const ALLOWED = ["Body","Bottoms","Bust","Eyes","Gloves","Hair","Hat","Shoes","Socks","Top","Presets"];
  if (!ALLOWED.includes(slot)) {
    return new Response("Invalid slot", { status: 400 });
  }

  const db = ctx.env.DB;

  // upsert-ish: ensure mod exists with slot
  await db.prepare(
    `INSERT INTO mods (creator_id, slug, title, description, slot)
     VALUES (
       (SELECT id FROM creators WHERE handle = ?),
       ?, ?, ?, ?
     )
     ON CONFLICT(slug) DO UPDATE SET
       title=excluded.title,
       description=excluded.description,
       slot=excluded.slot`
  ).bind("rowe", slug, title, description ?? null, slot).run();

  const modRow = await db.prepare(`SELECT id FROM mods WHERE slug = ?`).bind(slug).first();
  if (!modRow) return new Response("Mod not found", { status: 404 });

  await db.prepare(
    `INSERT INTO mod_versions (mod_id, version, r2_key, file_size, sha256, changelog)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(modRow.id, version, r2_key, file_size ?? null, sha256 ?? null, changelog ?? null).run();

  return Response.json({ ok: true });
};
