# -*- coding: utf-8 -*-
"""生成「秒记」Logo 方向对比图。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
os.makedirs(OUT, exist_ok=True)

S = 1024
CREAM = (255, 250, 242, 255)
VERM = (198, 61, 36, 255)
VERM_DARK = (176, 49, 26, 255)
PAPER = (247, 242, 232, 255)
INK = (36, 31, 26, 255)
MUTED = (140, 127, 112, 255)

KAI = r"C:\Windows\Fonts\simkai.ttf"
SONG = r"C:\Windows\Fonts\simsun.ttc"
YAHEI = r"C:\Windows\Fonts\msyh.ttc"


def font(path, size):
    return ImageFont.truetype(path, size)


def draw_round_seal(size=1024, seal_color=VERM):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size // 2
    r = int(size * 0.465)
    d.ellipse([c - r, c - r, c + r, c + r], fill=seal_color)
    # 内圈细线
    ring = int(r * 0.845)
    w = max(6, int(size * 0.011))
    d.ellipse([c - ring, c - ring, c + ring, c + ring], outline=(255, 250, 242, 150), width=w)
    # 缺角（右下）
    notch = int(size * 0.035)
    d.ellipse([c + int(r * 0.72), c + int(r * 0.72), c + int(r * 0.72) + notch, c + int(r * 0.72) + notch],
              fill=(0, 0, 0, 0))
    f = font(KAI, int(size * 0.50))
    d.text((c + 4, c + 8), "秒", font=f, fill=(110, 20, 6, 80), anchor="mm")
    d.text((c, c), "秒", font=f, fill=CREAM, anchor="mm")
    return img


def draw_square_seal(size=1024, seal_color=VERM):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = int(size * 0.05)
    rad = int(size * 0.13)
    d.rounded_rectangle([m, m, size - m, size - m], radius=rad, fill=seal_color)
    # 内框
    m2 = int(size * 0.115)
    w = max(5, int(size * 0.009))
    d.rounded_rectangle([m2, m2, size - m2, size - m2], radius=int(rad * 0.7),
                        outline=(255, 250, 242, 140), width=w)
    # 右下缺角
    notch = int(size * 0.075)
    d.rectangle([size - m - notch, size - m - int(notch * 1.4), size - m, size - m - int(notch * 0.15)],
                fill=(0, 0, 0, 0))
    f = font(KAI, int(size * 0.46))
    d.text((size // 2 + 3, size // 2 + 7), "秒", font=f, fill=(110, 20, 6, 80), anchor="mm")
    d.text((size // 2, size // 2), "秒", font=f, fill=CREAM, anchor="mm")
    return img


def draw_minimal(size=1024, seal_color=VERM):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = size // 2
    r = int(size * 0.465)
    d.ellipse([c - r, c - r, c + r, c + r], fill=seal_color)
    f = font(KAI, int(size * 0.54))
    d.text((c, c - int(size * 0.012)), "秒", font=f, fill=CREAM, anchor="mm")
    # 句点
    dot = int(size * 0.032)
    d.ellipse([c + int(size * 0.16), c + int(size * 0.285), c + int(size * 0.16) + dot,
               c + int(size * 0.285) + dot], fill=CREAM)
    return img


def draw_intaglio(size=1024, seal_color=VERM):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = int(size * 0.05)
    rad = int(size * 0.14)
    d.rounded_rectangle([m, m, size - m, size - m], radius=rad, fill=seal_color)
    m2 = int(size * 0.14)
    d.rounded_rectangle([m2, m2, size - m2, size - m2], radius=int(rad * 0.65), fill=CREAM)
    f = font(KAI, int(size * 0.43))
    d.text((size // 2, size // 2), "秒", font=f, fill=VERM_DARK, anchor="mm")
    # 缺角
    notch = int(size * 0.07)
    d.rectangle([size - m - notch, m, size - m, m + int(notch * 0.5)], fill=(0, 0, 0, 0))
    return img.rotate(-3, resample=Image.BICUBIC, expand=False)


variants = [
    ("A", "朱砂圆印", draw_round_seal()),
    ("B", "缺角方印", draw_square_seal()),
    ("C", "极简字印", draw_minimal()),
    ("D", "朱白方印", draw_intaglio()),
]

# 对比图
CELL = 330
PAD = 34
SHEET_W = CELL * 4 + PAD * 2
SHEET_H = 470
sheet = Image.new("RGBA", (SHEET_W, SHEET_H), PAPER)
d = ImageDraw.Draw(sheet)

f_label = font(YAHEI, 21)
f_sub = font(SONG, 19)
f_small = font(YAHEI, 16)

for i, (key, title, im) in enumerate(variants):
    x = PAD + i * CELL
    big = im.resize((190, 190), Image.LANCZOS)
    sheet.alpha_composite(big, (x + (CELL - 190) // 2, 48))
    # 32px 实际大小
    small = im.resize((32, 32), Image.LANCZOS)
    sheet.alpha_composite(small, (x + (CELL - 32) // 2, 258))
    d.text((x + CELL // 2, 300), f"{key} · {title}", font=f_sub, fill=INK, anchor="ma")
    d.text((x + CELL // 2, 332), "32px 实际大小", font=f_small, fill=MUTED, anchor="ma")

d.text((PAD, 14), "秒记 · Logo 方向", font=font(YAHEI, 22), fill=INK)
sheet.save(os.path.join(OUT, "logo-options.png"))

for key, title, im in variants:
    im.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"logo-{key.lower()}-512.png"))
    im.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, f"logo-{key.lower()}-64.png"))
    im.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, f"logo-{key.lower()}-32.png"))

print("written", os.path.join(OUT, "logo-options.png"))
