"""MINDS CLASH website videos: real gameplay stills (tools/video/record.mjs) turned into motion-graphics clips.
Each still becomes a short shot with a slow push-in or pan (pixels kept sharp: 2x nearest-neighbour first),
shots are joined with pixel-dissolve cuts; a 'burst' plays consecutive stills as stop-motion.
Usage: python tools/video/mg.py <recordings dir> <output dir> <shots.json>"""
import json, os, subprocess, sys

REC, OUT, PLAN = sys.argv[1], sys.argv[2], sys.argv[3]
W, H, FPS = 1280, 720, 30
TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)

def run(args):
    r = subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *args], capture_output=True, text=True)
    if r.returncode: raise SystemExit(r.stderr[-2000:])

# camera moves: push in, pull out, pan left/right (z = zoom, x/y = top-left of the window in the 2x image)
MOVES = {
    'in':    ("min(1.0+0.12*on/{d},1.12)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    'out':   ("max(1.12-0.12*on/{d},1.0)", "iw/2-(iw/zoom/2)", "ih/2-(ih/zoom/2)"),
    'left':  ("1.12", "(iw-iw/zoom)*(1-on/{d})", "ih/2-(ih/zoom/2)"),
    'right': ("1.12", "(iw-iw/zoom)*on/{d}", "ih/2-(ih/zoom/2)"),
    'up':    ("1.12", "iw/2-(iw/zoom/2)", "(ih-ih/zoom)*(1-on/{d})"),
    'hold':  ("1.0", "0", "0"),
}

def still(scene, idx, name, dur, move, focus=None):
    src = os.path.join(REC, scene, f'f{idx:05d}.jpg')
    d = round(dur * FPS); z, x, y = (m.format(d=d) for m in MOVES[move])
    if focus:   # push in toward a point (fractions of the picture)
        fx, fy = focus; z = f"min(1.0+0.35*on/{d},1.35)"; x = f"(iw-iw/zoom)*{fx}"; y = f"(ih-ih/zoom)*{fy}"
    out = os.path.join(TMP, name + '.mp4')
    run(['-loop', '1', '-i', src, '-vf', f"crop=iw:iw*9/16:0:(ih-iw*9/16)/2,scale={W*2}:{H*2}:flags=neighbor,zoompan=z='{z}':x='{x}':y='{y}':d={d}:s={W}x{H}:fps={FPS},setsar=1,format=yuv420p",
         '-frames:v', str(d), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out])
    return out, dur

def burst(scene, a, b, name, fps=8):
    """consecutive stills a..b played as stop-motion"""
    lst = os.path.join(TMP, name + '.txt')
    with open(lst, 'w') as f:
        for i in range(a, b + 1): f.write(f"file '{os.path.join(REC, scene, f'f{i:05d}.jpg').replace(os.sep, '/')}'\nduration {1 / fps:.4f}\n")
        f.write(f"file '{os.path.join(REC, scene, f'f{b:05d}.jpg').replace(os.sep, '/')}'\n")
    out = os.path.join(TMP, name + '.mp4'); dur = (b - a + 1) / fps
    run(['-f', 'concat', '-safe', '0', '-i', lst, '-vf', f'crop=iw:iw*9/16:0:(ih-iw*9/16)/2,scale={W}:{H}:flags=neighbor,fps={FPS},setsar=1,format=yuv420p', '-t', f'{dur:.3f}', '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', out])
    return out, dur

def join(parts, name, fade=0.35, crf=28):
    args, flt, off, last = [], '', 0.0, '[0:v]'
    for p, _ in parts: args += ['-i', p]
    for i in range(1, len(parts)):
        off += parts[i - 1][1] - fade
        flt += f"{last}[{i}:v]xfade=transition={'pixelize' if i % 2 else 'fadeblack'}:duration={fade}:offset={off:.3f}[x{i}];"
        last = f'[x{i}]'
    flt += f'{last}format=yuv420p[v]'
    out = os.path.join(OUT, name + '.mp4')
    run([*args, '-filter_complex', flt, '-map', '[v]', '-c:v', 'libx264', '-preset', 'slow', '-crf', str(crf), '-movflags', '+faststart', '-an', out])
    run(['-ss', '0.6', '-i', out, '-frames:v', '1', '-q:v', '4', os.path.join(OUT, name + '.jpg')])
    print(name, f'{os.path.getsize(out) / 1e6:.2f} MB')

plan = json.load(open(PLAN))
for name, shots in plan.items():
    parts = []
    for i, s in enumerate(shots):
        tag = f'{name}_{i}'
        parts.append(burst(s['scene'], s['from'], s['to'], tag, s.get('fps', 8)) if 'from' in s else still(s['scene'], s['i'], tag, s.get('dur', 1.6), s.get('move', 'in'), s.get('focus')))
    join(parts, name)
