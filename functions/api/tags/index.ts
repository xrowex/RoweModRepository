// functions/api/tags/index.ts

type Env = { DB: D1Database };

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const { results } = await ctx.env.DB.prepare(
    `SELECT name FROM tags ORDER BY name COLLATE NOCASE ASC`
  ).all();

  const items = (results as Array<{ name: string }>).map((row) => row.name);

  return Response.json({ items });
};
