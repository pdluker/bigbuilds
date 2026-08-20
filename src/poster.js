/**
 * poster.js — optional cover art per episode via Workers AI.
 * Best-effort: index.js already catches failures here and continues
 * audio-only, same pattern as pokepod's poster.js call site.
 *
 * Model + prompt rewritten Aug 17, 2026 for richer/more realistic art —
 * see README's "Cover art" section for the full reasoning and the
 * flux-2-dev upgrade path once it's been tested in the AI Playground.
 */

export async function generateCoverArt(event, env) {
  if (!env.AI) return null; // AI binding not configured — skip silently

  const prompt = `A richly detailed, atmospheric historical illustration: ${event.artPrompt}. Cinematic realism with real painterly depth — dramatic natural lighting, accurate period materials and textures (weathered steel, wet stone, aged wood, real fabric), volumetric atmosphere where it fits the scene (mist, smoke, dust, sea spray), a genuine sense of scale and depth of field. Evocative of a fine museum history painting or a National Geographic historical reconstruction — not a flat cartoon, not a children's-book illustration. Family-friendly, no graphic content. No text, no logos, no watermarks anywhere in the image. No photographic likeness of any specific named real person — render any human figures as silhouettes, from behind, or at a distance rather than close-up recognizable faces.`;

  const result = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
    prompt,
    num_steps: 6, // schnell is a turbo-distilled model tuned for ~4-8 steps — more steps than that doesn't buy quality, just cost
    width: 1024,
    height: 1024, // square — matches the site's art-frame CSS and standard podcast-art convention
  });

  return result; // ArrayBuffer/ReadableStream — R2 .put() accepts either directly
}

/**
 * UPGRADE PATH — flux-2-dev, Black Forest Labs' newer model, explicitly
 * marketed by Cloudflare for "highly realistic and detailed images...
 * physical world grounding." This is the real answer to "richer, deeper,
 * more realistic" if flux-1-schnell above isn't enough once you've seen
 * real output.
 *
 * NOT wired in as the default here because its Workers AI API uses
 * multipart form data rather than the plain JSON object every other
 * model call in this file uses — untested against the env.AI.run()
 * binding specifically. Test it in the Cloudflare AI Playground first
 * (developers.cloudflare.com → Workers AI → Playground → flux-2-dev),
 * confirm the exact input shape the binding expects, then swap the
 * model string and params above. Roughly 4x flux-1-schnell's per-image
 * cost — still trivial at this show's publishing volume.
 */

