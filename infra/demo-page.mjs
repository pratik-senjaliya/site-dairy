// Packs the demo build (apps/mobile/dist-demo, made with EXPO_PUBLIC_DEMO=1) into ONE html file with the app
// inlined, for hosts that allow no other files (a claude.ai artifact, an email attachment, any static host).
//   node infra/demo-page.mjs <dist-demo dir> <out.html>
import fs from 'node:fs';
import path from 'node:path';

const [dist, out] = process.argv.slice(2);
const index = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const src = index.match(/<script src="([^"]+)"/)[1];
// Inline script: "</script" or "<!--" inside the bundle would end or confuse the tag.
const js = fs.readFileSync(path.join(dist, src), 'utf8').replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');

const page = `<title>Site Diary Demo</title>
<meta name="theme-color" content="#C2410C">
<style>
  /* Single light theme on purpose: the app's own field palette (brick orange on warm off-white). */
  :root { --bg: #FAF7F2; --ink: #1C1917; --accent: #C2410C; color-scheme: light }
  html, body { height: 100%; background: var(--bg); color: var(--ink) }
  body { overflow: hidden }
  #root { display: flex; height: 100%; flex: 1 }
  #boot-error { padding: 24px; font: 16px/1.5 system-ui, sans-serif; color: var(--ink) }
  #boot-error b { color: var(--accent) }
</style>
<div id="root"></div>
<script>
  // The app's routes start at "/"; this page may be served under any path, so start there.
  try { if (location.pathname !== '/') history.replaceState(null, '', '/'); } catch (e) {}
  // The demo keeps its data in this browser; without storage it cannot run.
  try { localStorage.setItem('sd-probe', '1'); localStorage.removeItem('sd-probe'); }
  catch (e) { document.getElementById('root').innerHTML = '<div id="boot-error"><b>Site Diary demo</b><br>This browser is blocking site storage, which the demo needs to keep your entries. Open the link in Chrome, or allow site data, and reload.</div>'; window.__sdNoStorage = true; }
</script>
<script>
if (!window.__sdNoStorage) {
${js}
}
</script>
`;
fs.writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024 / 1024).toFixed(2)} MB`);
