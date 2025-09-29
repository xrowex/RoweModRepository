export const onRequestPost: PagesFunction<{
  DB: D1Database;
  BUNDLES: R2Bucket;
}> = async (context) => {
  const formData = await context.request.formData();

  const creator = formData.get("creator")?.toString() || "";
  const title = formData.get("title")?.toString() || "";
  const description = formData.get("description")?.toString() || "";
  const slot = formData.get("slot")?.toString() || "";
  const file = formData.get("file") as File;

  if (!creator || !title || !slot || !file) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Upload file to R2
  const key = `${slot}/${Date.now()}-${file.name}`;
  await context.env.BUNDLES.put(key, file.stream());

  // Insert into creators if not exists
  await context.env.DB.prepare(
    "INSERT OR IGNORE INTO creators (id, handle, is_verified) VALUES (?1, ?2, ?3)"
  ).bind(1, creator, creator, 0).run();

  // Insert into mods
  const slug = title.toLowerCase().replace(/\s+/g, "-");
  await context.env.DB.prepare(
    "INSERT INTO mods (creator_id, slug, title, description, slot) VALUES (?1, ?2, ?3, ?4, ?5)"
  ).bind(creator, slug, title, description, slot).run();

  // Insert version
  await context.env.DB.prepare(
    "INSERT INTO mod_versions (mod_id, version, r2_key, file_size, changelog, created_at) VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))"
  ).bind(creator, "1.0.0", key, file.size, "Initial upload").run();

  return new Response(
    JSON.stringify({ success: true, message: "Upload complete", key }),
    { headers: { "Content-Type": "application/json" } }
  );
};
