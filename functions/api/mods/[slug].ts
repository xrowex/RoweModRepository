export const onRequestGet: PagesFunction<{ DB: D1Database }> = async (ctx) => {
  const slug = ctx.params.slug as string;

  const mod = await ctx.env.DB.prepare(
    `SELECT m.id, m.slug, m.title, m.description, c.handle AS creator
     FROM mods m
     JOIN creators c ON c.id = m.creator_id
     WHERE m.slug = ?`
  ).bind(slug).first();

  if (!mod) return new Response("Not found", { status: 404 });

  const versions = await ctx.env.DB.prepare(
    `SELECT version, r2_key, file_size, sha256, changelog, created_at
     FROM mod_versions
     WHERE mod_id = ?
     ORDER BY created_at DESC`
  ).bind(mod.id).all();

  return Response.json({ ...mod, versions: versions.results });
};
