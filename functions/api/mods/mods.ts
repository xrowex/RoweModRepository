export const onRequestGet: PagesFunction<{ DB: D1Database }> = async (ctx) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT m.id, m.slug, m.title, m.description,
            c.handle AS creator,
            (SELECT COUNT(*) FROM mod_versions v WHERE v.mod_id = m.id) AS version_count
     FROM mods m
     JOIN creators c ON c.id = m.creator_id
     ORDER BY m.created_at DESC`
  ).all();

  return Response.json(results);
};
