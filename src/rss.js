/**
 * rss.js — builds a standard podcast RSS 2.0 + iTunes feed from the episode list.
 * Served at /feed.xml so the show can be added to any podcast app.
 */

export function buildFeed(episodes, env) {
  const items = episodes
    .map(
      (ep) => `
    <item>
      <title>${escapeXml(ep.title)}</title>
      <description>${escapeXml(ep.summary)}</description>
      <enclosure url="${ep.audioUrl}" type="audio/mpeg"${ep.audioSizeBytes ? ` length="${ep.audioSizeBytes}"` : ''} />
      <guid isPermaLink="false">${ep.id}</guid>
      <pubDate>${new Date(ep.publishedAt).toUTCString()}</pubDate>
      ${ep.durationSeconds ? `<itunes:duration>${ep.durationSeconds}</itunes:duration>` : ''}
      ${ep.artUrl ? `<itunes:image href="${ep.artUrl}" />` : ''}
    </item>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>${escapeXml(env.SHOW_NAME)}</title>
    <link>${env.SHOW_SITE_URL}</link>
    <language>en-us</language>
    <itunes:author>${escapeXml(env.SHOW_AUTHOR)}</itunes:author>
    <itunes:category text="Kids &amp; Family" />
    <itunes:explicit>false</itunes:explicit>
    <description>Every episode reveals the hidden engineering secret behind something you thought you already understood — real stories, real numbers, under five minutes.</description>
    ${env.COVER_IMAGE_KEY ? `<itunes:image href="${env.SHOW_SITE_URL}/${env.COVER_IMAGE_KEY}" />` : ''}
    ${items}
  </channel>
</rss>`;
}

function escapeXml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
