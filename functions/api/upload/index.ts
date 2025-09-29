// functions/api/upload/index.ts
import { randomUUID } from "crypto";

type Env = {
  DB: D1Database;
  BUNDLES: R2Bucket;
};

export const onRequestGet: PagesFunction<Env> = async () => {
  return new Response("Upload endpoint ready ✅", { status: 200 });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  try {
    const formData = await ctx.request.formData();
    const creator = formData.get("creator")?.toString() || "";
    const title = formData.get("title")?.toString() || "";
    const description = formData.get("description")?.toString() || "";
    const slot = formData.get("slot")?.toString() || "";
    const file = formData.get("file") as File;

    if (!creator || !title || !slot || !file) {
      return Response.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Make a slug + version ID
    const slug = `${slot.toLowerCase()}-${randomUUID().slice(0, 8)}`;
    const version = "1.0.0";

    // Upload file to R2
    const key = `${slot.toLowerCase()}/${slug}/${file.name}`;
    await ctx.env.BUNDLES.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });

    // Insert creator if not exists
    await ctx.env.DB.prepare(
      "INSERT OR IGNORE INTO creators (handle, is_verified) VALUES (?, ?)"
    ).bind(creator, 0).run();

    // Get creator id
    const creatorRow = await ctx.env.DB
      .prepare("SELECT id FROM creators WHERE handle = ?")
      .bind(creator)
      .first<{ id: number }>();

    if (!creatorRow) {
      return Response.json({ error: "Could not find creator after insert" }, { status: 500 });
    }

    // Insert mod
    const modResult = await ctx.env.DB.prepare(
      "INSERT INTO mods (creator_id, slug, title, description, slot) VALUES (?, ?, ?, ?, ?)"
    ).bind(creatorRow.id, slug, title, description, slot).run();

    const modId = modResult.lastRowId;

    // Insert version
    await ctx.env.DB.prepare(
      "INSERT INTO mod_versions (mod_id, version, r2_key, file_size, changelog, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    ).bind(modId, version, key, file.size, "Initial upload").run();

    return Response.json({
      success: true,
      slug,
      r2_key: key,
      file_size: file.size,
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
};
