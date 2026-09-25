"""
Trains the small digit net that reads a scoresheet's boxes.

Run it with MNIST unpacked into $DIGITS_DIR/mnist (the four idx files
from https://storage.googleapis.com/cvdf-datasets/mnist/), then paste the
base64 from the JSON it writes into
src/lib/scoresheet/digits/weights.ts. Needs numpy and nothing else.

Deliberately tiny: it ships inside the app and runs in a phone browser
with no native dependency, so it is a few thousand parameters, not a few
million. That is enough for isolated digits, which is all a scoresheet
box holds.

The augmentation is the part that matters. MNIST is soft grey strokes,
centred and sized by hand; a Snatzee box is a hard black-and-white mask
from a phone photo, with whatever stroke width the pen had and a degree
or two of tilt left over. So every sample is rotated, scaled, shifted,
thickened or thinned, and then thresholded to binary the way the real
pipeline thresholds a photo.
"""
import os
import numpy as np, struct, sys, json, base64, time

# Where MNIST was unpacked and where the weights are written. Both are
# outside the repository: the dataset is 50MB and the output is pasted
# into src/lib/scoresheet/digits/weights.ts.
SP = os.environ.get('DIGITS_DIR', '/tmp/snatzee-digits')
rng = np.random.default_rng(7)

def load(images, labels):
    with open(f'{SP}/mnist/{images}', 'rb') as f:
        magic, n, h, w = struct.unpack('>IIII', f.read(16))
        x = np.frombuffer(f.read(), np.uint8).reshape(n, h, w).astype(np.float32) / 255
    with open(f'{SP}/mnist/{labels}', 'rb') as f:
        struct.unpack('>II', f.read(8))
        y = np.frombuffer(f.read(), np.uint8).astype(np.int64)
    return x, y

Xtr, Ytr = load('train-images-idx3-ubyte', 'train-labels-idx1-ubyte')
Xte, Yte = load('t10k-images-idx3-ubyte', 't10k-labels-idx1-ubyte')
print('train', Xtr.shape, 'test', Xte.shape)

# ---------------------------------------------------------------- augment
def affine(batch, angles, scales, dx, dy):
    """Rotate/scale/translate about the centre, bilinear, batched."""
    n, h, w = batch.shape
    ys, xs = np.mgrid[0:h, 0:w]
    xs = xs - (w - 1) / 2
    ys = ys - (h - 1) / 2
    cos, sin = np.cos(angles)[:, None, None], np.sin(angles)[:, None, None]
    s = scales[:, None, None]
    sx = (cos * xs + sin * ys) / s + (w - 1) / 2 - dx[:, None, None]
    sy = (-sin * xs + cos * ys) / s + (h - 1) / 2 - dy[:, None, None]
    x0 = np.floor(sx).astype(int); y0 = np.floor(sy).astype(int)
    fx = sx - x0; fy = sy - y0
    out = np.zeros_like(batch)
    idx = np.arange(n)[:, None, None]
    for ox, oy, wgt in ((0, 0, (1-fx)*(1-fy)), (1, 0, fx*(1-fy)), (0, 1, (1-fx)*fy), (1, 1, fx*fy)):
        xx = np.clip(x0 + ox, 0, w - 1); yy = np.clip(y0 + oy, 0, h - 1)
        inside = ((x0 + ox >= 0) & (x0 + ox < w) & (y0 + oy >= 0) & (y0 + oy < h))
        out += np.where(inside, batch[idx, yy, xx] * wgt, 0)
    return out

def thicken(batch, amount):
    """Crude dilate/erode: a max or min over the 4-neighbourhood."""
    out = batch.copy()
    shifted = np.stack([
        np.pad(batch, ((0,0),(1,0),(0,0)))[:, :-1, :],
        np.pad(batch, ((0,0),(0,1),(0,0)))[:, 1:, :],
        np.pad(batch, ((0,0),(0,0),(1,0)))[:, :, :-1],
        np.pad(batch, ((0,0),(0,0),(0,1)))[:, :, 1:],
    ])
    grow = shifted.max(0); shrink = shifted.min(0)
    out = np.where(amount[:, None, None] > 0, grow, out)
    out = np.where(amount[:, None, None] < 0, shrink, out)
    return out

def augment(batch):
    n = batch.shape[0]
    x = affine(batch,
               rng.normal(0, 0.14, n).astype(np.float32),          # ±8° typical
               rng.uniform(0.82, 1.15, n).astype(np.float32),
               rng.uniform(-2.0, 2.0, n).astype(np.float32),
               rng.uniform(-2.0, 2.0, n).astype(np.float32))
    x = thicken(x, rng.integers(-1, 2, n))
    # Binarise most of the time, at a threshold that moves: the real
    # pipeline hands over a hard mask, at whatever cut Otsu picked.
    t = rng.uniform(0.25, 0.6, n).astype(np.float32)[:, None, None]
    hard = (x > t).astype(np.float32)
    keep_grey = (rng.random(n) < 0.2)[:, None, None]
    return np.where(keep_grey, x, hard)

# ------------------------------------------------------------------- net
# conv(1->8,5x5) relu pool2  conv(8->16,5x5) relu pool2  fc(256->10)
def he(shape, fan_in):
    return (rng.normal(0, np.sqrt(2 / fan_in), shape)).astype(np.float32)

W1 = he((8, 1, 5, 5), 25); b1 = np.zeros(8, np.float32)
W2 = he((16, 8, 5, 5), 8 * 25); b2 = np.zeros(16, np.float32)
W3 = he((256, 10), 256); b3 = np.zeros(10, np.float32)

def im2col(x, k):
    n, c, h, w = x.shape
    oh, ow = h - k + 1, w - k + 1
    cols = np.empty((n, c, k, k, oh, ow), np.float32)
    for i in range(k):
        for j in range(k):
            cols[:, :, i, j] = x[:, :, i:i+oh, j:j+ow]
    return cols.reshape(n, c * k * k, oh * ow)

def conv(x, W, b):
    n = x.shape[0]; f, c, k, _ = W.shape
    oh = x.shape[2] - k + 1
    cols = im2col(x, k)
    out = np.einsum('fj,njp->nfp', W.reshape(f, -1), cols) + b[None, :, None]
    return out.reshape(n, f, oh, oh), cols

def conv_back(dout, cols, W, xshape, k):
    n, f, oh, ow = dout.shape
    dflat = dout.reshape(n, f, -1)
    dW = np.einsum('nfp,njp->fj', dflat, cols).reshape(W.shape)
    db = dflat.sum((0, 2))
    dcols = np.einsum('fj,nfp->njp', W.reshape(f, -1), dflat)
    c = xshape[1]
    dx = np.zeros(xshape, np.float32)
    dcols = dcols.reshape(n, c, k, k, oh, ow)
    for i in range(k):
        for j in range(k):
            dx[:, :, i:i+oh, j:j+ow] += dcols[:, :, i, j]
    return dx, dW, db

def pool(x):
    n, c, h, w = x.shape
    x = x.reshape(n, c, h // 2, 2, w // 2, 2)
    out = x.max((3, 5))
    mask = (x == out[:, :, :, None, :, None])
    return out, mask

def pool_back(d, mask):
    n, c, h, w = d.shape
    return (mask * d[:, :, :, None, :, None]).reshape(n, c, h * 2, w * 2)

def forward(x):
    a1, cols1 = conv(x, W1, b1); r1 = np.maximum(a1, 0)
    p1, m1 = pool(r1)
    a2, cols2 = conv(p1, W2, b2); r2 = np.maximum(a2, 0)
    p2, m2 = pool(r2)
    flat = p2.reshape(x.shape[0], -1)
    logits = flat @ W3 + b3
    return logits, (x, cols1, a1, m1, p1, cols2, a2, m2, p2, flat)

def step(x, y, lr):
    global W1, b1, W2, b2, W3, b3
    logits, cache = forward(x)
    xin, cols1, a1, m1, p1, cols2, a2, m2, p2, flat = cache
    logits -= logits.max(1, keepdims=True)
    e = np.exp(logits); p = e / e.sum(1, keepdims=True)
    n = x.shape[0]
    loss = -np.log(p[np.arange(n), y] + 1e-9).mean()
    d = p.copy(); d[np.arange(n), y] -= 1; d /= n
    dW3 = flat.T @ d; db3 = d.sum(0)
    dflat = (d @ W3.T).reshape(p2.shape)
    dr2 = pool_back(dflat, m2) * (a2 > 0)
    dp1, dW2, db2 = conv_back(dr2, cols2, W2, p1.shape, 5)
    dr1 = pool_back(dp1, m1) * (a1 > 0)
    _, dW1, db1 = conv_back(dr1, cols1, W1, xin.shape, 5)
    for param, grad in ((W1, dW1), (b1, db1), (W2, dW2), (b2, db2), (W3, dW3), (b3, db3)):
        param -= lr * grad
    return loss

def accuracy(x, y, binarise=False):
    correct = 0
    for i in range(0, len(x), 500):
        b = x[i:i+500]
        if binarise:
            b = (b > 0.4).astype(np.float32)
        logits, _ = forward(b[:, None])
        correct += (logits.argmax(1) == y[i:i+500]).sum()
    return correct / len(x)

EPOCHS = int(sys.argv[1]) if len(sys.argv) > 1 else 4
BATCH = 128
start = time.time()
for epoch in range(EPOCHS):
    order = rng.permutation(len(Xtr))
    total = 0.0
    lr = 0.06 * (0.6 ** epoch)
    for i in range(0, len(order) - BATCH, BATCH):
        idx = order[i:i+BATCH]
        xb = augment(Xtr[idx])[:, None]
        total += step(xb, Ytr[idx], lr)
    print(f'epoch {epoch+1}: loss {total / (len(order)//BATCH):.4f}  '
          f'test {accuracy(Xte, Yte):.4f}  test-binarised {accuracy(Xte, Yte, True):.4f}  '
          f'{time.time()-start:.0f}s', flush=True)

params = {'W1': W1, 'b1': b1, 'W2': W2, 'b2': b2, 'W3': W3, 'b3': b3}
blob = b''.join(np.ascontiguousarray(v, np.float32).tobytes() for v in params.values())
meta = {k: list(v.shape) for k, v in params.items()}
with open(f'{SP}/digits.json', 'w') as f:
    json.dump({'shapes': meta, 'data': base64.b64encode(blob).decode()}, f)
print('weights', len(blob), 'bytes ->', f'{SP}/digits.json')
