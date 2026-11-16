# -*- coding: utf-8 -*-
"""生成「秒记」的应用图标与托盘图标。"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
os.makedirs(OUT, exist_ok=True)

S = 1024
CX = CY = S // 2
R = int(S * 0.455)

img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 由外到内的暖红径向渐变
c_outer = (183, 47, 22)
c_mid = (222, 72, 38)
c_in = (255, 152, 94)
for i in range(R, 0, -1):
    t = 1 - i / R
    if t < 0.72:
        k = t / 0.72
        c = tuple(int(c_outer[j] + (c_mid[j] - c_outer[j]) * k) for j in range(3))
    else:
        k = (t - 0.72) / 0.28
        c = tuple(int(c_mid[j] + (c_in[j] - c_mid[j]) * k) for j in range(3))
    d.ellipse([CX - i, CY - i, CX + i, CY + i], fill=c + (255,))

# 内侧高光弧
d.arc([CX - R + 10, CY - R + 10, CX + R - 10, CY + R - 10], 200, 320,
      fill=(255, 220, 190, 120), width=14)
# 外圈细边
d.ellipse([CX - R, CY - R, CX + R, CY + R], outline=(255, 214, 180, 90), width=8)

font_path = None
for fp in (r"C:\Windows\Fonts\simkai.ttf", r"C:\Windows\Fonts\msyhbd.ttc",
           r"C:\Windows\Fonts\msyh.ttc"):
    if os.path.exists(fp):
        font_path = fp
        break

if font_path:
    font = ImageFont.truetype(font_path, int(S * 0.47))
    # 文字轻微阴影
    d.text((CX + 6, CY + 8), "秒", font=font, fill=(120, 26, 8, 90), anchor="mm")
    d.text((CX, CY), "秒", font=font, fill=(255, 250, 244, 255), anchor="mm")

img.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "icon-512.png"))
img.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "icon.png"))
img.resize((64, 64), Image.LANCZOS).save(os.path.join(OUT, "icon-64.png"))

ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
img.save(os.path.join(OUT, "icon.ico"), sizes=ico_sizes)

# 托盘图标：小尺寸下更清晰的红底白「秒」
tray = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
td = ImageDraw.Draw(tray)
td.ellipse([2, 2, 62, 62], fill=(214, 65, 34, 255))
if font_path:
    tf = ImageFont.truetype(font_path, 40)
    td.text((32, 33), "秒", font=tf, fill=(255, 250, 244, 255), anchor="mm")
tray.save(os.path.join(OUT, "tray.png"))
tray.resize((16, 16), Image.LANCZOS).save(os.path.join(OUT, "tray-16.png"))

print("icons written to", OUT)
