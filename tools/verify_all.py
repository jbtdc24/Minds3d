"""Pixel-check EVERY Mind: the art the game uses vs the official on-chain image. Writes tools/verify_report.json."""
import concurrent.futures as cf, io, json, os, sys, urllib.request
import numpy as np
from PIL import Image
SRC = sys.argv[1] if len(sys.argv) > 1 else 'D:/ANIMOCA MINDS/MINDS.GAMES/minds games v4'
ROOT = os.path.join(os.path.dirname(__file__), '..')
onchain = json.load(open(os.path.join(ROOT, 'tools', 'onchain_metadata.json')))
mapping = json.load(open(os.path.join(ROOT, 'tools', 'onchain_to_art.json')))
GW = ['https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/']
def check(tid):
    cid = onchain[tid]['image'].replace('ipfs://', '')
    for k in range(6):
        try:
            with urllib.request.urlopen(urllib.request.Request(GW[k % 2] + cid, headers={'User-Agent': 'mindclash'}), timeout=40) as r:
                img = Image.open(io.BytesIO(r.read())).convert('RGB')
            a = np.asarray(img.resize((300, 300), Image.NEAREST), dtype=np.int16)
            b = np.asarray(Image.open(os.path.join(SRC, 'images', f"{mapping[tid]}.png")).convert('RGB').resize((300, 300), Image.NEAREST), dtype=np.int16)
            return tid, float(np.abs(a - b).mean())
        except Exception:
            pass
    return tid, None
res = {}
with cf.ThreadPoolExecutor(16) as ex:
    for n, (tid, d) in enumerate(ex.map(check, sorted(mapping, key=int))):
        res[tid] = d
        if n % 250 == 0: print(n, flush=True)
bad = {k: v for k, v in res.items() if v is not None and v > 2}
failed = [k for k, v in res.items() if v is None]
json.dump({'checked': len(res) - len(failed), 'identical': len(res) - len(failed) - len(bad), 'mismatch': bad, 'download_failed': failed}, open(os.path.join(ROOT, 'tools', 'verify_report.json'), 'w'), indent=1)
print('checked', len(res) - len(failed), 'identical', len(res) - len(failed) - len(bad), 'mismatch', len(bad), 'download failed', len(failed))
