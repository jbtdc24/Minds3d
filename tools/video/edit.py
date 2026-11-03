"""Edits filmed gameplay (tools/video/film.mjs, smooth 30 fps) into the website videos: camera push-ins on real
footage, kinetic pixel-font captions, title cards and varied transitions. Silent (the site plays them muted).
Usage: python tools/video/edit.py <film dir> <output dir> tools/video/edit.json"""
import json, os, subprocess, sys

FILM, OUT, PLAN = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS = 1280, 720, 30
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts', 'PixelifySans.ttf').replace('\\', '/').replace(':', '\\:')
TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)
TRANS = ['pixelize', 'wipeleft', 'slideup', 'circleopen', 'pixelize', 'wiperight', 'slidedown', 'fadeblack']

def run(args):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-3000:])

def esc(t): return t.replace('\\', '\\\\').replace("'", "’").replace(':', '\\:').replace(',', '\\,')

def caption(text, sub=None, start=0.25):
    """a lime tag sliding in at the bottom left, big white pixel text under it"""
    a = f"if(lt(t-{start},0),0,min(1,(t-{start})/0.25))"
    slide = f"if(lt(t-{start},0.3),-600+(660)*(t-{start})/0.3,60)"
    f = [f"drawbox=x=0:y=ih-150:w=iw:h=150:color=black@0.45:t=fill",
         f"drawtext=fontfile='{FONT}':text='{esc(text)}':fontsize=64:fontcolor=white:borderw=5:bordercolor=black:x='{slide}':y=h-128:alpha='{a}'"]
    if sub: f.append(f"drawtext=fontfile='{FONT}':text='{esc(sub)}':fontsize=28:fontcolor=0xc6f432:borderw=3:bordercolor=black:x='{slide}+4':y=h-56:alpha='{a}'")
    return f

def footage(p, name):
    src = os.path.join(FILM, p['src'] + '.mp4'); t0, t1 = p['t0'], p['t1']; D = t1 - t0
    z0, z1 = p.get('zoom', [1.0, 1.08]); fx, fy = p.get('focus', [0.5, 0.5]); speed = p.get('speed', 1.0)
    vf = [f"setpts=PTS/{speed}" if speed != 1 else 'null',
          f"scale=w='trunc({W}*({z0}+({z1}-{z0})*t/{D / speed})/2)*2':h='trunc({H}*({z0}+({z1}-{z0})*t/{D / speed})/2)*2':eval=frame:flags=bicubic",
          f"crop={W}:{H}:x='(iw-{W})*{fx}':y='(ih-{H})*{fy}'", 'setsar=1']
    if p.get('cap'): vf += caption(p['cap'], p.get('sub'))
    out = os.path.join(TMP, name + '.mp4')
    run(['-ss', str(t0), '-t', str(D), '-i', src, '-vf', ','.join(vf) + f',fps={FPS},format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-an', out])
    return out, D / speed

def card(p, name):
    """a title card: blurred, darkened footage behind big pixel type that rises in"""
    src = os.path.join(FILM, p.get('bg', 'duel') + '.mp4'); D = p.get('dur', 2.2)
    a = "min(1,t/0.35)"; rise = "(h-text_h)/2-40+40*max(0,1-t/0.35)"
    vf = [f"scale={W}:{H}", "gblur=sigma=14", "eq=brightness=-0.22:saturation=1.2",
          f"drawtext=fontfile='{FONT}':text='{esc(p['title'])}':fontsize={p.get('size', 120)}:fontcolor=white:borderw=8:bordercolor=black:x=(w-text_w)/2:y='{rise}':alpha='{a}'"]
    if p.get('sub'): vf.append(f"drawtext=fontfile='{FONT}':text='{esc(p['sub'])}':fontsize=34:fontcolor=0xc6f432:borderw=4:bordercolor=black:x=(w-text_w)/2:y=(h/2)+50:alpha='min(1,max(0,(t-0.3)/0.35))'")
    out = os.path.join(TMP, name + '.mp4')
    run(['-ss', str(p.get('at', 1.0)), '-t', str(D), '-i', src, '-vf', ','.join(vf) + f',fps={FPS},setsar=1,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-an', out])
    return out, D

def join(parts, name, fade=0.4, crf=26, width=W):
    args, flt, off, last = [], '', 0.0, '[0:v]'
    for p, _ in parts: args += ['-i', p]
    for i in range(1, len(parts)):
        off += parts[i - 1][1] - fade
        flt += f"{last}[{i}:v]xfade=transition={TRANS[(i - 1) % len(TRANS)]}:duration={fade}:offset={off:.3f}[x{i}];"
        last = f'[x{i}]'
    flt += f"{last}scale={width}:-2:flags=bicubic,format=yuv420p[v]"
    out = os.path.join(OUT, name + '.mp4')
    run([*args, '-filter_complex', flt, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-movflags', '+faststart', '-an', out])
    run(['-ss', '1.2', '-i', out, '-frames:v', '1', '-q:v', '3', os.path.join(OUT, name + '.jpg')])
    print(name, f'{os.path.getsize(out) / 1e6:.2f} MB')

plan = json.load(open(PLAN, encoding='utf-8'))
for name, spec in plan.items():
    parts = [(card if 'title' in p else footage)(p, f'{name}_{i}') for i, p in enumerate(spec['parts'])]
    join(parts, name, crf=spec.get('crf', 26), width=spec.get('width', W)) if len(parts) > 1 else os.replace(parts[0][0], os.path.join(OUT, name + '.mp4'))
