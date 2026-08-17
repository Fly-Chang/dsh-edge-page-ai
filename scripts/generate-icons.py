from PIL import Image, ImageDraw
import os
root = r'F:\AI_worker\Edge-page-ai\src\edge-bridge\icons'
os.makedirs(root, exist_ok=True)

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i]-a[i])*t) for i in range(3))

def gradient(size, c1, c2):
    img = Image.new('RGB', (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        d.line([(0,y),(size,y)], fill=lerp(c1,c2,y/max(1,size-1)))
    return img

def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=255)
    return mask

def make_icon(size):
    bg = gradient(size, (79,110,247), (124,92,240))
    mask = rounded_mask(size, int(size*0.22))
    icon = Image.new('RGBA', (size, size), (0,0,0,0))
    icon.paste(bg, (0,0), mask)

    d = ImageDraw.Draw(icon)
    s = size / 128.0
    bubble = [int(30*s), int(26*s), int(98*s), int(84*s)]
    radius = int(14*s)
    d.rounded_rectangle(bubble, radius=radius, fill=(255,255,255,255))
    tail = [
        (int(48*s), int(84*s)),
        (int(34*s), int(102*s)),
        (int(64*s), int(84*s)),
    ]
    d.polygon(tail, fill=(255,255,255,255))
    dot_colors = [(79,110,247), (124,92,240), (255,159,67)]
    dot_y = int(55*s)
    dot_r = int(5.5*s)
    for i, color in enumerate(dot_colors):
        cx = int((46 + i*18)*s)
        d.ellipse([cx-dot_r, dot_y-dot_r, cx+dot_r, dot_y+dot_r], fill=color)
    return icon

for size in (16, 32, 48, 128):
    icon = make_icon(size)
    icon.save(os.path.join(root, f'icon{size}.png'))
    print('saved', size)
