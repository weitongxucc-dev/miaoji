# -*- coding: utf-8 -*-
"""生成「秒记」像素角色方向对比图。"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
os.makedirs(OUT, exist_ok=True)

CREAM = (246, 237, 222, 255)
PAPER = (247, 242, 232, 255)
INK = (35, 28, 22, 255)
ORANGE = (217, 119, 87, 255)
ORANGE_D = (183, 88, 58, 255)
ORANGE_L = (243, 169, 140, 255)
VERM = (196, 69, 43, 255)
WHITE = (255, 250, 242, 255)
CYAN = (126, 210, 214, 255)

KAI = r"C:\Windows\Fonts\simkai.ttf"
SONG = r"C:\Windows\Fonts\simsun.ttc"
YAHEI = r"C:\Windows\Fonts\msyh.ttc"


def font(path, size):
    return ImageFont.truetype(path, size)


def outline(img, color=INK):
    alpha = img.split()[3].filter(ImageFilter.MaxFilter(3))
    base = Image.new("RGBA", img.size, color)
    base.putalpha(alpha)
    return Image.alpha_composite(base, img)


def upscale(img, size):
    return img.resize((size, size), Image.NEAREST)


# ---------------- A. 像素机器人 ----------------

def robot_sprite():
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def r(x0, y0, x1, y1, c):
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)

    # 天线
    r(15, 1, 17, 7, INK)
    r(13, 0, 19, 4, ORANGE)
    r(14, 0, 16, 2, ORANGE_L)
    # 头（像素圆角）
    r(7, 7, 25, 21, ORANGE)
    r(5, 9, 27, 19, ORANGE)
    r(6, 8, 26, 20, ORANGE)
    # 头顶高光
    r(7, 8, 11, 9, ORANGE_L)
    # 面屏
    r(8, 10, 24, 19, CREAM)
    r(9, 11, 23, 18, CREAM)
    # 眼睛
    r(11, 12, 14, 16, INK)
    r(18, 12, 21, 16, INK)
    r(11, 12, 12, 13, WHITE)
    r(18, 12, 19, 13, WHITE)
    # 微笑
    r(14, 17, 15, 18, INK)
    r(17, 17, 18, 18, INK)
    r(15, 18, 17, 19, INK)
    # 侧耳
    r(3, 12, 6, 17, ORANGE_D)
    r(26, 12, 29, 17, ORANGE_D)
    r(4, 13, 5, 16, ORANGE_L)
    r(27, 13, 28, 16, ORANGE_L)
    # 身体
    r(9, 21, 23, 28, CREAM)
    r(10, 22, 22, 27, CREAM)
    # 胸口小屏
    r(12, 23, 20, 27, ORANGE)
    r(13, 24, 19, 26, VERM)
    r(15, 24, 17, 26, CREAM)
    # 手臂
    r(4, 21, 8, 26, ORANGE)
    r(24, 21, 28, 26, ORANGE)
    r(3, 25, 8, 28, ORANGE_L)
    r(24, 25, 29, 28, ORANGE_L)
    # 腿
    r(11, 28, 14, 31, INK)
    r(18, 28, 21, 31, INK)
    r(10, 30, 15, 32, INK)
    r(17, 30, 22, 32, INK)
    # 螺丝
    r(10, 21, 11, 22, ORANGE_D)
    r(21, 21, 22, 22, ORANGE_D)

    return outline(img, INK)


# ---------------- B. Clawd 像素蟹 ----------------

def crab_sprite():
    img = Image.new("RGBA", (32, 32), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    def r(x0, y0, x1, y1, c):
        d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=c)

    # 身体
    r(6, 11, 26, 22, ORANGE)
    r(7, 10, 25, 23, ORANGE)
    r(8, 12, 12, 13, ORANGE_L)
    # 眼睛
    r(11, 14, 15, 18, INK)
    r(18, 14, 22, 18, INK)
    r(12, 14, 13, 15, WHITE)
    r(19, 14, 20, 15, WHITE)
    # 小嘴（极简）
    r(15, 19, 18, 20, ORANGE_D)
    # 钳子
    r(2, 15, 8, 21, ORANGE)
    r(1, 14, 4, 17, ORANGE)
    r(4, 14, 7, 17, ORANGE)
    r(5, 16, 7, 19, (0, 0, 0, 0))  # 钳口
    r(25, 15, 31, 21, ORANGE)
    r(29, 14, 32, 17, ORANGE)
    r(26, 14, 29, 17, ORANGE)
    r(26, 16, 28, 19, (0, 0, 0, 0))
    # 四条腿
    r(8, 22, 11, 27, ORANGE_D)
    r(13, 23, 16, 28, ORANGE_D)
    r(17, 23, 20, 28, ORANGE_D)
    r(22, 22, 25, 27, ORANGE_D)
    r(7, 27, 12, 29, INK)
    r(12, 28, 17, 30, INK)
    r(16, 28, 21, 30, INK)
    r(21, 27, 26, 29, INK)

    return outline(img, INK)


# ---------------- C. 圆润机器人 ----------------

def soft_robot(size=1024):
    S = size
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = S // 2

    # 天线
    d.rounded_rectangle([c - 14, 60, c + 14, 150], radius=14, fill=ORANGE_D)
    d.ellipse([c - 55, 20, c + 55, 130], fill=ORANGE)
    d.ellipse([c - 38, 38, c + 6, 82], fill=ORANGE_L)

    # 头
    d.rounded_rectangle([140, 150, S - 140, 560], radius=150, fill=CREAM, outline=INK, width=16)
    # 面屏
    d.rounded_rectangle([190, 215, S - 190, 470], radius=100, fill=INK)
    d.rounded_rectangle([208, 233, S - 208, 452], radius=82, fill=(45, 37, 30, 255))
    # 眼睛
    d.ellipse([280, 300, 380, 400], fill=CYAN)
    d.ellipse([S - 380, 300, S - 280, 400], fill=CYAN)
    d.ellipse([300, 318, 332, 350], fill=WHITE)
    d.ellipse([S - 360, 318, S - 328, 350], fill=WHITE)
    # 腮红
    d.ellipse([235, 415, 305, 455], fill=(243, 169, 140, 200))
    d.ellipse([S - 305, 415, S - 235, 455], fill=(243, 169, 140, 200))

    # 身体
    d.rounded_rectangle([230, 570, S - 230, 870], radius=110, fill=CREAM, outline=INK, width=16)
    # 胸口屏
    d.rounded_rectangle([330, 620, S - 330, 780], radius=40, fill=ORANGE)
    f = font(KAI, 92)
    d.text((c, 700), "秒", font=f, fill=CREAM, anchor="mm")
    # 手臂
    d.rounded_rectangle([80, 590, 220, 740], radius=65, fill=ORANGE, outline=INK, width=14)
    d.rounded_rectangle([S - 220, 590, S - 80, 740], radius=65, fill=ORANGE, outline=INK, width=14)
    # 腿
    d.rounded_rectangle([330, 860, 470, 960], radius=45, fill=ORANGE_D, outline=INK, width=14)
    d.rounded_rectangle([S - 470, 860, S - 330, 960], radius=45, fill=ORANGE_D, outline=INK, width=14)

    return img


variants = [
    ("A", "像素小机器人", "8-bit 机器人，最贴合「小机器人」的说法", robot_sprite()),
    ("B", "Clawd 像素蟹", "Claude 真正的官方吉祥物，圆润小螃蟹", crab_sprite()),
    ("C", "圆润小机器人", "非像素、柔和卡通，更像桌面陪伴物", soft_robot()),
]

CELL = 380
PAD = 36
SHEET_W = CELL * 3 + PAD * 2
SHEET_H = 500
sheet = Image.new("RGBA", (SHEET_W, SHEET_H), PAPER)
d = ImageDraw.Draw(sheet)

f_title = font(YAHEI, 22)
f_label = font(YAHEI, 21)
f_desc = font(YAHEI, 15)
f_tiny = font(YAHEI, 13)

d.text((PAD, 16), "秒记 · 角色方向", font=f_title, fill=INK)

for i, (key, title, desc, im) in enumerate(variants):
    x = PAD + i * CELL
    if im.size[0] <= 64:
        big = upscale(im, 224)
        small = upscale(im, 64)
    else:
        big = im.resize((224, 224), Image.LANCZOS)
        small = im.resize((64, 64), Image.LANCZOS)
    sheet.alpha_composite(big, (x + (CELL - 224) // 2, 58))
    sheet.alpha_composite(small, (x + (CELL - 64) // 2, 300))
    d.text((x + CELL // 2, 372), f"{key} · {title}", font=f_label, fill=INK, anchor="ma")
    # wrap desc
    words = desc
    d.text((x + CELL // 2, 402), words, font=f_desc, fill=(120, 105, 90, 255), anchor="ma")
    d.text((x + CELL // 2, 428), "64px 实际大小", font=f_tiny, fill=(160, 145, 130, 255), anchor="ma")

d.text((PAD, 466), "注：Claude 官方吉祥物是像素小螃蟹 Clawd，不是机器人。", font=f_tiny, fill=(150, 132, 115, 255))
sheet.save(os.path.join(OUT, "character-options.png"))

for key, title, desc, im in variants:
    if im.size[0] <= 64:
        upscale(im, 512).save(os.path.join(OUT, f"character-{key.lower()}-512.png"))
        upscale(im, 128).save(os.path.join(OUT, f"character-{key.lower()}-128.png"))
        upscale(im, 64).save(os.path.join(OUT, f"character-{key.lower()}-64.png"))
        upscale(im, 32).save(os.path.join(OUT, f"character-{key.lower()}-32.png"))
    else:
        im.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"character-{key.lower()}-512.png"))
        im.resize((128, 128), Image.LANCZOS).save(os.path.join(OUT, f"character-{key.lower()}-128.png"))
        im.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, f"character-{key.lower()}-64.png"))
        im.resize((32, 32), Image.LANCZOS).save(os.path.join(OUT, f"character-{key.lower()}-32.png"))

print("written", os.path.join(OUT, "character-options.png"))
