// functions/api/mods/index.ts
type Env = { DB: D1Database };

// helper to build "?,?,?" placeholders
function placeholders(n: number) { return Array.from({ length: n }, () => "?").join(","); }

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);

  const q        = (url.searchParams.get("q") || "").trim();         // search text
  const sort     = (url.searchParams.get("sort") || "new").toLowerCase(); // new | title | trending
  const date     = url.searchParams.get("date");                      // last_day | last_week | last_month | last_3_months | last_year
  const slots    = url.searchParams.getAll("slot");                   // e.g. slot=Hat&slot=Top
  const limitRaw = parseInt(url.searchParams.get("limit") || "24", 10);
  const limit    = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 48)) : 24;
  const cursor   = url.searchParams.get("cursor");                    // numeric mod id for "id < cursor"

  const where: string[] = [];
  const params: any[] = [];

  // search in title/description/creator handle
  if (q) {
    where.push("(m.title LIKE ? OR m.description LIKE ? OR c.handle LIKE ?)");
    const like = `%${q}%`;
    params.push(like, like, like);
  }

  // category filter (your clothing/body slots)
  if (slots.length) {
    where.push(`m.slot IN (${placeholders(slots.length)})`);
    params.push(...slots);
  }

  // date window based on latest version time
  // we compute latest per mod via CTE and then filter with SQLite datetime
  let dateFilter = "";
  if (date) {
    const daysMap: Record<string, number> = {
      last_day: 1,
      last_week: 7,
      last_month: 30,
      last_3_months: 90,
      last_year: 365,
    };
    const days = daysMap[date];
    if (days) {
      // filter later using l.last_version_at >= datetime('now', '-X days')
      dateFilter = `AND l.last_version_at >= datetime('now', ?)`
      params.push(`-${days} days`);
    }
  }

  // cursor pagination (older than given id)
  if (cursor) {
    const cur = parseInt(cursor, 10);
    if (Number.isFinite(cur)) {
      where.push("m.id < ?");
      params.push(cur);
    }
  }

  const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

  // ordering
  let orderBy = `ORDER BY l.last_version_at DESC`;
  if (sort === "title") {
    orderBy = `ORDER BY m.title COLLATE NOCASE ASC`;
  } else if (sort === "trending") {
    // simple "newer first" proxy; replace with a real hotness score later
    orderBy = `ORDER BY (julianday('now') - julianday(l.last_version_at)) ASC`;
  }

  const sql = `
    WITH latest AS (
      SELECT mod_id, MAX(created_at) AS last_version_at
      FROM mod_versions
      GROUP BY mod_id
    )
    SELECT
      m.id,
      m.slug,
      m.title,
      m.description,
      m.slot,
      c.handle AS creator,
      l.last_version_at,
      (SELECT COUNT(*) FROM mod_versions v WHERE v.mod_id = m.id) AS version_count
    FROM mods m
    JOIN creators c ON c.id = m.creator_id
    LEFT JOIN latest l ON l.mod_id = m.id
    ${whereClause}
    ${dateFilter}
    ${orderBy}
    LIMIT ?
  `;

  // ask for one extra row to decide if there's a next page
  const { results } = await ctx.env.DB.prepare(sql).bind(...params, limit + 1).all();

  let nextCursor: number | null = null;
  let items = results;

  if (results.length === limit + 1) {
    // use the id of the last item we plan to show as the "next cursor"
    nextCursor = (results[limit - 1] as any).id as number;
    items = results.slice(0, limit);
  }

  return Response.json({ items, nextCursor });
};
