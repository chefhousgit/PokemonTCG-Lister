const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '../public/card-dashboard.src.html');
const dest = path.join(__dirname, '../public/card-dashboard.html');

let html = fs.readFileSync(src, 'utf8');

html = html.replace(
  '<title>Card Database - for PTCGPB</title>',
  '<title>Card Database - Pocket Lister</title>',
);

html = html.replace(
  'location.protocol === "http:" &&\n                    (location.hostname === "localhost" ||\n                        location.hostname === "127.0.0.1")',
  'location.protocol === "http:" || location.protocol === "https:"',
);

const inject = `
<style id="lister-dashboard-overrides">
  #instancePickerOverlay,
  #receivedPickerOverlay,
  .use-local-card-images,
  #useLocalCardImagesCell { display: none !important; }
</style>
<script id="lister-dashboard-bridge">
(function () {
  const origFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const url = typeof input === "string" ? input : (input && input.url) || "";
    if (/\\/__dashboard\\/(instances|settings-friend-id|account-json\\/open|account-shinedust\\/deduct)/.test(url)
      && init && init.method && /POST|PUT/i.test(init.method)) {
      return Promise.resolve(new Response(JSON.stringify({ ok: false, error: "Disabled in Lister" }), { status: 400, headers: { "Content-Type": "application/json" } }));
    }
    return origFetch(input, init);
  };
})();
</script>
`;

if (!html.includes('lister-dashboard-overrides')) {
  html = html.replace('</body>', `${inject}</body>`);
}

fs.writeFileSync(dest, html);
console.log('[dashboard] wrote', dest, html.length, 'bytes');
