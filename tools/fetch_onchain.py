"""Download the official metadata for every Mind from IPFS (the contract's tokenURI base).
Writes tools/onchain_metadata.json = { tokenId: metadata }. Resumable.
Usage: python tools/fetch_onchain.py
"""
import concurrent.futures as cf, json, os, time, urllib.request

BASE = 'QmcvnRgH7Gu1paBaVvgsvLyePNWkAmTRPGNzKV3CeyPR6e'   # tokenURI(1) = ipfs://<BASE>/1 on Robinhood Chain
GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://gateway.pinata.cloud/ipfs/', 'https://ipfs.filebase.io/ipfs/', 'https://nftstorage.link/ipfs/']
OUT = os.path.join(os.path.dirname(__file__), 'onchain_metadata.json')
data = json.load(open(OUT)) if os.path.exists(OUT) else {}

def get(i):
    for attempt in range(8):
        gw = GATEWAYS[(i + attempt) % len(GATEWAYS)]
        try:
            with urllib.request.urlopen(urllib.request.Request(f'{gw}{BASE}/{i}', headers={'User-Agent': 'mindclash'}), timeout=30) as r:
                return i, json.loads(r.read())
        except Exception:
            time.sleep(1.5 * (attempt + 1))
    return i, None

todo = [i for i in range(1, 3334) if str(i) not in data]
with cf.ThreadPoolExecutor(24) as ex:
    for n, (i, md) in enumerate(ex.map(get, todo)):
        if md: data[str(i)] = md
        if n % 100 == 0:
            json.dump(data, open(OUT, 'w')); print(len(data), flush=True)
json.dump(data, open(OUT, 'w'))
print('done', len(data), 'missing', [i for i in range(1, 3334) if str(i) not in data][:20])
