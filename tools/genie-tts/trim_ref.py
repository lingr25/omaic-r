import numpy as np, soundfile as sf

audio, sr = sf.read(r"缪尔赛斯01.wav")
win = int(sr * 0.05)  # 50ms frames
n = len(audio) // win
rms = np.sqrt((audio[: n * win].reshape(n, win) ** 2).mean(axis=1))
thr = rms.max() * 0.06  # silence threshold
quiet = rms < thr

# find quiet gaps >= 0.3s
gaps, start = [], None
for i, q in enumerate(quiet):
    if q and start is None: start = i
    elif not q and start is not None:
        if (i - start) * 0.05 >= 0.3: gaps.append((start * 0.05, i * 0.05))
        start = None
print("gaps (s):", [(round(a,2), round(b,2)) for a, b in gaps])

# candidate cuts: end of a gap, at least 3s in, at most 10s
cands = [b for a, b in gaps if 3.0 <= b <= 10.0]
print("valid cut points:", cands)
if cands:
    cut = cands[-1]  # latest valid cut => longest ref within 10s
    sf.write(r"缪尔赛斯01_trimmed.wav", audio[: int(cut * sr)], sr)
    print(f"trimmed to {cut:.2f}s -> 缪尔赛斯01_trimmed.wav")
