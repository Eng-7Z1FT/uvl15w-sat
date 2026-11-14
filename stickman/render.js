const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const dir = process.argv[2]; const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 600, height: 800 }, deviceScaleFactor: 2 });
  fs.mkdirSync(path.join(dir, 'png'), { recursive: true });
  const names = fs.readdirSync(path.join(dir, 'svg')).filter(f => f.endsWith('.svg') && !f.startsWith('.')).sort();
  for (const f of names) {
    await p.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync(path.join(dir,'svg',f),'utf8')}</body></html>`);
    await p.screenshot({ path: path.join(dir, 'png', f.replace('.svg', '.png')), omitBackground: true, clip: { x: 0, y: 0, width: 600, height: 800 } });
  }
  const labels = ['السلام عليكم','الشرح','البرمجة','التفكير','مفتاح السيارة','نجحت!','مشكلة!'];
  const cells = names.map((f, i) => `<div class=c>${fs.readFileSync(path.join(dir,'svg',f),'utf8').replace('width="600" height="800"','width="300" height="400"')}<span>${labels[i]}</span></div>`).join('');
  await p.setViewportSize({ width: 1240, height: 900 });
  await p.setContent(`<html><body style="margin:0;background:#0b0f0c;font-family:Arial;color:#f3efe4"><h1 dir="rtl" style="text-align:center;color:#e8922e;margin:16px 0 0">شخصية &#x2068;7Z1FT&#x2069;</h1><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;padding:8px">${cells}</div><style>.c{display:flex;flex-direction:column;align-items:center;background:#122016;border-radius:14px;padding-bottom:8px}.c span{font-size:20px;font-weight:bold}</style></body></html>`);
  await p.screenshot({ path: path.join(dir, 'preview_sheet.png'), fullPage: true });
  await b.close();
})();
