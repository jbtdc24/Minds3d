"""Pixel-check EVERY Mind: the art the game uses vs the official on-chain image. Writes tools/verify_report.json."""
import concurrent.futures as cf, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4'
ROOT = os.path.join(os.path.dirname(__file__), '..')
onchain = json.load(open(os.path.join(ROOT, 'tools', 'onchain_metadata.json')))
mapping = json.load(open(os.path.join(ROOT, 'tools', 'onchain_to_art.json')))
GW = ['https://ipfs.filebase.io/ipfs/', 'https://w3s.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/']
REPORT = os.path.join(ROOT, 'tools', 'verify_report.json')
# resumable: keep earlier results, only re-check tokens that failed to download
prev = json.load(open(REPORT)) if os.path.exists(REPORT) else {}
done = prev.get('results', {})
def check(tid):
    cid = onchain[tid]['image'].replace('ipfs://', '')
    for k in range(9):
        try:
            with urllib.request.urlopen(urllib.request.Request(GW[k % 3] + cid, headers={'User-Agent': 'mindclash'}), timeout=40) as r:
                img = Image.open(io.BytesIO(r.read())).convert('RGB')
            a = np.asarray(img.resize((300, 300), Image.NEAREST), dtype=np.int16)
            b = np.asarray(Image.open(os.path.join(SRC, 'images', f"{mapping[tid]}.png")).convert('RGB').resize((300, 300), Image.NEAREST), dtype=np.int16)
            return tid, float(np.abs(a - b).mean())
        except Exception:
            pass
    return tid, None
res = {k: v for k, v in done.items() if v is not None}
todo = [t for t in sorted(mapping, key=int) if t not in res]
print('to check', len(todo), flush=True)
with cf.ThreadPoolExecutor(8) as ex:
    for n, (tid, d) in enumerate(ex.map(check, todo)):
        res[tid] = d
        if n % 250 == 0: print(n, flush=True)
bad = {k: v for k, v in res.items() if v is not None and v > 2}
failed = [k for k, v in res.items() if v is None]
json.dump({'checked': len(res) - len(failed), 'identical': len(res) - len(failed) - len(bad), 'mismatch': bad, 'download_failed': failed, 'results': res}, open(REPORT, 'w'), indent=1)
print('checked', len(res) - len(failed), 'identical', len(res) - len(failed) - len(bad), 'mismatch', len(bad), 'download failed', len(failed))
