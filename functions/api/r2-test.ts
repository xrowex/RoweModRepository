export const onRequestGet: PagesFunction<{ BUNDLES: R2Bucket }> = async (ctx) => {
  try {
    const key = `test/${Date.now()}.txt`;
    const res = await ctx.env.BUNDLES.put(key, "hello from pages", {
      httpMetadata: { contentType: "text/plain" },
    });
    return Response.json({ ok: true, key, res });
  } catch (e) {
    return Response.json({ ok: false, error: String(e) }, { status: 500 });
  }
};
