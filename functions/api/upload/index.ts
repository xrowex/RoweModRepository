// functions/api/upload/index.ts
type Env = {
  DB: D1Database;
  BUNDLES: R2Bucket;
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const formData = await ctx.request.formData();

    // Grab form fields
    const title = formData.get("title")?.toString();
    const description = formData.get("description")?.toString();
    const slot = formData.get("slot")?.toString();
    const creator = formData.get("creator")?.toString();
    const file = formData.get("file") as File | null;

    // Debug log (remove in production)
    console.log("Got fields:", {
      title,
      description,
      slot,
      creator,
      file: file ? file.name : null,
    });

    // Validate required fields
    if (!title || !description || !slot || !creator || !file) {
      return Response.json(
        { error: "Missing required fields", got: [...formData.keys()] },
        { status: 400 }
      );
    }

    // Generate slug from title (lowercase + dash)
    const slug = title.toLowerCase().replace(/\s+/g, "-");

    // Upload file to R2
    const fileKey = `${slot.toLowerCase()}/${slug}/${file.name}`;
    await ctx.env.BUNDLES.put(fileKey, file.stream());

    // Insert into DB
    const createdAt = new Date().toISOString();
    await ctx.env.DB.prepare(
      `INSERT INTO mods (creator_id, slug, title, description, slot) 
       VALUES ((SELECT id FROM creators WHERE handle=?), ?, ?, ?, ?)`
    )
      .bind(creator, slug, title, description, slot)
      .run();

    await ctx.env.DB.prepare(
      `INSERT INTO mod_versions (mod_id, version, r2_key, file_size, changelog, created_at)
       VALUES ((SELECT id FROM mods WHERE slug=?), ?, ?, ?, ?, ?)`
    )
      .bind(slug, "1.0.0", fileKey, file.size, "Initial upload", createdAt)
      .run();

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
