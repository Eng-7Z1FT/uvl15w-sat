"""Builds the claude.ai skill package skill_claude_ai/7z1ft-stickman(.zip)."""
import base64, os, re, shutil, zipfile
D = 'skill_claude_ai/7z1ft-stickman'
shutil.rmtree(D, ignore_errors=True); os.makedirs(D + '/assets')
for f in ['engine.js', 'scene.js', 'scene.html']: shutil.copy(f, D)
for f in ['logo_cutout.png', 'tyre_patch.png', 'handle.png']: shutil.copy('assets/' + f, D + '/assets/')
shutil.copy('sample_transparent.png', D + '/approved_sample.png')
shutil.copy('preview_sheet.png', D + '/poses.png')
shutil.copy('skill_reel_template.html', D + '/reel_template.html') if os.path.exists('skill_reel_template.html') else None
# self-contained scene: scripts inline + images as data URIs (works inside an artifact)
uri = lambda p: 'data:image/png;base64,' + base64.b64encode(open(p, 'rb').read()).decode()
html = open('scene.html').read()
eng, scn = open('engine.js').read(), open('scene.js').read()
for name in ['logo_cutout.png', 'tyre_patch.png', 'handle.png']:
    scn = scn.replace('assets/' + name, uri('assets/' + name))
html = html.replace('<script src="engine.js"></script><script src="scene.js"></script>', f'<script>{eng}</script><script>{scn}</script>')
open(D + '/scene_standalone.html', 'w').write(html)
open(D + '/SKILL.md', 'w').write(open('SKILL_claude_ai.md').read())
z = 'skill_claude_ai/7z1ft-stickman.zip'
if os.path.exists(z): os.remove(z)
with zipfile.ZipFile(z, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, _, files in os.walk(D):
        for f in files: zf.write(os.path.join(root, f), os.path.relpath(os.path.join(root, f), 'skill_claude_ai'))
print('ok', os.path.getsize(z))
