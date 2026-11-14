// node render_overlay.js plan.json framesDir  -> transparent PNG per frame
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const [,, planFile, out] = process.argv; const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.join(__dirname, 'overlay.html'));
  const [w, h] = await p.evaluate(pl => window.setup(pl), plan);
  await p.setViewportSize({ width: w, height: h });
  const n = plan.mouth.length, t0 = Date.now();
  for (let i = 0; i < n; i++) {
    await p.evaluate(i => window.renderAt(i), i);
    await p.screenshot({ path: path.join(out, String(i).padStart(6, '0') + '.png'), omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
    if (i % 300 === 0) process.stdout.write(`\r  frames ${i}/${n}`);
  }
  console.log(`\r  frames ${n}/${n} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (errs.length) { console.error('page errors:', errs); process.exit(1); }
  await b.close();
})();
