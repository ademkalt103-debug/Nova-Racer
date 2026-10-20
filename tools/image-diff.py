"""Compare deterministic original and Rust presentation fixtures; no image edits."""
import json
import sys
from pathlib import Path
import numpy as np
from PIL import Image

root=Path(sys.argv[1] if len(sys.argv)>1 else 'evidence/equivalence')
expected=3 if root.name=='race-equivalence' else 9
results=[]
for original in root.glob('*-original.png'):
    name=original.stem.removesuffix('-original')
    a=np.asarray(Image.open(original).convert('RGB')).astype(np.int16)
    b=np.asarray(Image.open(root/(name+'-rust.png')).convert('RGB')).astype(np.int16)
    delta=np.abs(a-b)
    result={'scene':name,'mean_absolute_rgb_error':float(delta.mean()),'pixels_over_12_rgb':float((delta.max(axis=2)>12).mean())}
    results.append(result)
print(json.dumps(results,indent=2))
(root/'pixel-diff.json').write_text(json.dumps(results,indent=2),encoding='utf8')
if len(results)!=expected or any(r['mean_absolute_rgb_error'] != 0 for r in results):
    raise SystemExit(f'Expected {expected} pixel-identical deterministic presentation fixtures')
