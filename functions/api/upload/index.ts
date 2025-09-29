// functions/api/upload/index.ts
type Env = {
  DB: D1Database;
  BUNDLES: R2Bucket;
};

const ALLOWED_SLOTS = new Set([
  "Body","Bottoms","Bust","Eyes","Gloves","Hair","Hat","Shoes","Socks","Top","Presets",
]);

function slugifyTitle(input: string) {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function ensureUniqueSlug(db: D1Database, baseSlug: string) {
  const likePattern = `${baseSlug}-%`;
  const { results } = await db
    .prepare(`SELECT slug FROM mods WHERE slug = ? OR slug LIKE ?`)
    .bind(baseSlug, likePattern)
    .all();

  const taken = new Set((results as Array<{ slug: string }>).map(r => r.slug));
  if (!taken.has(baseSlug)) return baseSlug;

  let n = 2;
  while (taken.has(`${baseSlug}-${n}`)) n++;
  return `${baseSlug}-${n}`;
}

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const formData = await ctx.request.formData();

    const title   = formData.get("title")?.toString();
    const desc    = formData.get("description")?.toString();
    const slotRaw = formData.get("slot")?.toString();
    const creator = formData.get("creator")?.toString();
    const file    = formData.get("file") as File | null;

    const slot = slotRaw?.trim();

    if (!title || !desc || !slot || !creator || !file) {
      return Response.json({ error: "Missing required fields", got: [...formData.keys()] }, { status: 400 });
    }
    if (!ALLOWED_SLOTS.has(slot)) {
      return Response.json({ error: `Invalid slot '${slot}'` }, { status: 400 });
    }
    if (file.size === 0) {
      return Response.json({ error: "File is empty" }, { status: 400 });
    }

    const db = ctx.env.DB;

    // find creator
    const creatorRow = await db.prepare(`SELECT id FROM creators WHERE handle = ?`).bind(creator).first<{id:number}>();
    if (!creatorRow) {
      return Response.json({ error: `Unknown creator handle '${creator}'` }, { status: 400 });
    }

    // slug + R2 key
    const baseSlug = slugifyTitle(title) || `mod-${Date.now().toString(36)}`;
    const slug     = await ensureUniqueSlug(db, baseSlug);
    const fileKey  = `${slot.toLowerCase()}/${slug}/${file.name}`;

    // upload to R2 (set contentType if available)
    await ctx.env.BUNDLES.put(fileKey, file.stream(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    // insert mod
    await db.prepare(
      `INSERT INTO mods (creator_id, slug, title, description, slot)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(creatorRow.id, slug, title, desc, slot).run();

    // get mod id
    const modRow = await db.prepare(`SELECT id FROM mods WHERE slug = ?`).bind(slug).first<{id:number}>();
    if (!modRow) throw new Error("Failed to load inserted mod");

    // insert first version with SQLite timestamp format
    await db.prepare(
      `INSERT INTO mod_versions (mod_id, version, r2_key, file_size, changelog, created_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`
    ).bind(modRow.id, "1.0.0", fileKey, file.size, "Initial upload").run();

    return Response.json({
      success: true,
      message: "Mod uploaded successfully",
      slug,
      fileKey,
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Upload failed", details: String(err) }, { status: 500 });
  }
};
