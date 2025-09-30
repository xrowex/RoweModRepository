// functions/api/upload/index.ts
type Env = {
  DB: D1Database;
  BUNDLES: R2Bucket;
};

const ALLOWED_SLOTS = new Set([
  "Body", "Bottoms", "Bust", "Eyes", "Gloves",
  "Hair", "Hat", "Shoes", "Socks", "Top", "Presets",
]);

function slugifyTitle(input: string) {
  return (input || "")
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
    // ---- Parse form
    const form = await ctx.request.formData();
    const title = form.get("title")?.toString().trim();
    const description = form.get("description")?.toString().trim();
    const slot = form.get("slot")?.toString().trim();
    const creator = form.get("creator")?.toString().trim();
    const file = form.get("file") as File | null;

    console.log("Upload received:", { title, slot, creator, fileName: file?.name, size: file?.size });

    if (!title || !description || !slot || !creator || !file) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }
    if (!ALLOWED_SLOTS.has(slot)) {
      return Response.json({ error: `Invalid slot '${slot}'` }, { status: 400 });
    }
    if (file.size <= 0) {
      return Response.json({ error: "File is empty" }, { status: 400 });
    }

    const db = ctx.env.DB;

    // ---- Resolve creator
    const creatorRow = await db
      .prepare(`SELECT id FROM creators WHERE handle = ?`)
      .bind(creator)
      .first<{ id: number }>();

    console.log("Creator lookup:", creatorRow);

    if (!creatorRow) {
      return Response.json({ error: `Unknown creator handle '${creator}'` }, { status: 400 });
    }

    // ---- Slug
    const baseSlug = slugifyTitle(title) || `mod-${Date.now().toString(36)}`;
    const slug = await ensureUniqueSlug(db, baseSlug);
    console.log("Slug chosen:", { baseSlug, slug });

    // ---- R2 PUT (arrayBuffer)
    const bytes = await file.arrayBuffer();
    const fileKey = `${slot.toLowerCase()}/${slug}/${file.name}`;
    console.log("Putting to R2:", { fileKey, size: bytes.byteLength, contentType: file.type });

    const putRes = await ctx.env.BUNDLES.put(fileKey, bytes, {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });

    if (!putRes) {
      console.error("R2 put returned null");
      return Response.json({ error: "R2 upload failed" }, { status: 500 });
    }
    console.log("R2 put OK:", putRes);

    // ---- Insert into mods
    const createdAt = new Date().toISOString();
    const modInsert = await db
      .prepare(
        `INSERT INTO mods (creator_id, slug, title, description, slot)
         VALUES (?, ?, ?, ?, ?)`
      )
      .bind(creatorRow.id, slug, title, description, slot)
      .run();

    console.log("mods insert:", modInsert);

    // fetch mod id
    const modRow = await db
      .prepare(`SELECT id FROM mods WHERE slug = ?`)
      .bind(slug)
      .first<{ id: number }>();

    console.log("Inserted mod row:", modRow);

    if (!modRow) {
      console.error("Failed to read back inserted mod");
      return Response.json({ error: "Failed to create mod" }, { status: 500 });
    }

    // ---- Insert into mod_versions
    const verInsert = await db
      .prepare(
        `INSERT INTO mod_versions (mod_id, version, r2_key, file_size, changelog, created_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
      .bind(modRow.id, "1.0.0", fileKey, file.size, "Initial upload")
      .run();

    console.log("mod_versions insert:", verInsert);

    return Response.json({
      success: true,
      message: "Mod uploaded successfully",
      slug,
      fileKey,
      size: file.size,
    });
  } catch (err: any) {
    console.error("Upload failed:", err?.stack || err);
    return Response.json({ error: "Upload failed", details: String(err) }, { status: 500 });
  }
};
