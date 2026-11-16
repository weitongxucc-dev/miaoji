# -*- coding: utf-8 -*-
"""生成「秒记」终端风像素机器人、应用图标与托盘图标。

造型来自 Claude Code 的小机器人：一块宽扁的橙色方块身体，
两只黑色方形眼睛，中间一条向两侧伸出的手臂，底下四条小短腿。
不使用描边、渐变和多余细节，靠剪影和眼睛识别。
"""
import io
import os
import struct
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.normpath(os.path.join(HERE, "..", "assets"))
RENDER = os.path.normpath(os.path.join(HERE, "..", "renderer", "assets"))
os.makedirs(OUT, exist_ok=True)
os.makedirs(RENDER, exist_ok=True)

# 颜色：终端背景 + Claude 橙 + 近黑眼睛
BG = (30, 30, 30, 255)       # #1E1E1E 终端底
TILE = (24, 24, 24, 255)     # #181818 图标底板
BORDER = (58, 58, 58, 255)   # #3A3A3A 图标边框
O = (217, 119, 87, 255)      # #D97757 Claude 橙
K = (20, 20, 20, 255)        # #141414 眼睛
DIM = (168, 168, 168, 255)   # 预览文字

# 32 x 22 的逻辑网格
GRID_W, GRID_H = 32, 22


def _r(d, box, color):
    """整数矩形，至少 1px。"""
    x0, y0, x1, y1 = box
    if x1 <= x0 or y1 <= y0:
        return
    d.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)


def bot_image(width, mode="idle", compact=False):
    """按目标宽度绘制机器人，透明背景，按整数像素对齐。

    眼睛由同一套网格生成：普通状态下是两块 3x4 的方块，
    look-* 让眼睛整体偏移，blink/sleep 压成一条横线，
    happy 变成拱形，think 上移，error 两侧不对称。
    """
    width = max(8, int(width))
    height = max(6, round(width * GRID_H / GRID_W))
    sx = width / GRID_W
    sy = height / GRID_H

    def X(v):
        return int(round(v * sx))

    def Y(v):
        return int(round(v * sy))

    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 身体（宽扁方块）
    _r(d, (X(3), Y(2), X(29), Y(16)), O)
    # 手臂：横贯整块，左右伸出
    _r(d, (X(1), Y(11), X(31), Y(15)), O)
    # 腿：外侧两条 + 内侧两条
    for x0, x1 in ((3, 5), (7, 9), (23, 25), (27, 29)):
        _r(d, (X(x0), Y(16), X(x1), Y(21)), O)

    # 眼睛
    ew = 3
    left_x = 8
    right_x = 24 - ew

    if mode == "blink":
        _r(d, (X(left_x), Y(8), X(left_x + ew), Y(9)), K)
        _r(d, (X(right_x), Y(8), X(right_x + ew), Y(9)), K)
    elif mode == "wink":
        # 一只眼正常，另一只压成短线
        _r(d, (X(left_x), Y(5), X(left_x + ew), Y(9)), K)
        _r(d, (X(right_x), Y(8), X(right_x + ew), Y(9)), K)
    elif mode == "sleep":
        _r(d, (X(left_x), Y(7), X(left_x + ew), Y(8)), K)
        _r(d, (X(right_x), Y(7), X(right_x + ew), Y(8)), K)
    elif mode == "happy":
        # 拱形笑眼：一条横梁 + 两侧短腿
        for ex in (left_x, right_x):
            _r(d, (X(ex), Y(5), X(ex + ew), Y(6)), K)
            _r(d, (X(ex), Y(5), X(ex + 1), Y(9)), K)
            _r(d, (X(ex + ew - 1), Y(5), X(ex + ew), Y(9)), K)
    elif mode == "think":
        # 眼睛上移，像在看上方
        _r(d, (X(left_x), Y(4), X(left_x + ew), Y(8)), K)
        _r(d, (X(right_x), Y(4), X(right_x + ew), Y(8)), K)
    elif mode == "error":
        # 一只眼睛压低，做出困惑的表情
        _r(d, (X(left_x), Y(5), X(left_x + ew), Y(8)), K)
        _r(d, (X(right_x), Y(7), X(right_x + ew), Y(9)), K)
    else:
        dx = 0
        dy = 0
        if mode == "look-left":
            dx = -2
        elif mode == "look-right":
            dx = 2
        elif mode == "look-up":
            dy = -1
        elif mode == "look-down":
            dy = 1
        _r(d, (X(left_x + dx), Y(5 + dy), X(left_x + ew + dx), Y(9 + dy)), K)
        _r(d, (X(right_x + dx), Y(5 + dy), X(right_x + ew + dx), Y(9 + dy)), K)

    return img


def dots_image(size=192):
    """思考时的形态变换：三个橙色方块，像终端里的省略号。"""
    size = int(size)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    cell = round(size * 0.155)
    gap = round(size * 0.085)
    total = cell * 3 + gap * 2
    x = (size - total) // 2
    y = (size - cell) // 2
    for i in range(3):
        _r(d, (x + i * (cell + gap), y, x + i * (cell + gap) + cell, y + cell), O)
    return img


def square(img, size):
    """把宽扁的机器人放进正方形画布，垂直居中。"""
    size = int(size)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    canvas.alpha_composite(img, (0, (size - img.height) // 2))
    return canvas


def app_icon(size):
    """应用图标：深色终端方块 + 机器人；大尺寸加一行提示符。"""
    size = int(size)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = max(1, round(size * 0.035))
    bw = max(1, round(size * 0.014))
    _r(d, (m, m, size - m, size - m), BORDER)
    _r(d, (m + bw, m + bw, size - m - bw, size - m - bw), TILE)

    prompt = size >= 128
    if prompt:
        # >_ 提示符
        px = m + round(size * 0.09)
        py = m + round(size * 0.085)
        t = max(2, round(size * 0.016))
        arm = round(size * 0.055)
        d.line([(px, py), (px + arm, py + arm), (px, py + 2 * arm)], fill=O, width=t, joint="curve")
        cx = px + arm + round(size * 0.02)
        cy = py + 2 * arm
        d.rectangle([cx, cy - t // 2, cx + round(size * 0.07), cy + t // 2], fill=O)

    bot_w = round(size * (0.80 if prompt else 0.84))
    bot = bot_image(bot_w)
    top = m + (round(size * 0.20) if prompt else (size - bot.height) // 2)
    img.alpha_composite(bot, ((size - bot.width) // 2, top))
    return img


def write_ico(path, images):
    header = struct.pack("<HHH", 0, 1, len(images))
    entries = b""
    data = b""
    offset = 6 + 16 * len(images)
    for im in images:
        buf = io.BytesIO()
        im.save(buf, "PNG")
        payload = buf.getvalue()
        w, h = im.size
        entries += struct.pack("<BBBBHHII", 0 if w >= 256 else w, 0 if h >= 256 else h, 0, 0, 1, 32, len(payload), offset + len(data))
        data += payload
    with open(path, "wb") as f:
        f.write(header + entries + data)


# 表情帧：renderer 用 192 方图（6x），assets 用 96 方图（3x）
MODES = (
    "idle", "blink", "wink", "happy", "think", "error", "sleep",
    "look-left", "look-right", "look-up", "look-down",
)
for mode in MODES:
    frames = square(bot_image(192, mode), 192)
    frames.save(os.path.join(RENDER, f"robot-{mode}.png"))
    square(bot_image(96, mode), 96).save(os.path.join(OUT, f"robot-{mode}-96.png"))
    # 32px 标题栏头像专用的 64px 源图，避免把 192px 图硬缩到 2x
    square(bot_image(64, mode, compact=True), 64).save(os.path.join(RENDER, f"robot-{mode}-compact.png"))

# 思考形态：三个橙色方块
square(dots_image(192), 192).save(os.path.join(RENDER, "robot-dots.png"))
square(dots_image(96), 96).save(os.path.join(OUT, "robot-dots-96.png"))

# 应用图标：每个尺寸单独绘制，避免非整数缩放
icon_images = [(s, app_icon(s)) for s in (16, 24, 32, 48, 64, 128, 256)]
write_ico(os.path.join(OUT, "icon.ico"), [im for _, im in icon_images])
app_icon(256).save(os.path.join(OUT, "icon.png"))
app_icon(512).save(os.path.join(OUT, "icon-512.png"))

# 托盘：透明背景，只放机器人，16/24/32 分别绘制
tray_images = []
for s in (16, 24, 32):
    timg = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    bot = bot_image(round(s * 0.94))
    timg.alpha_composite(bot, ((s - bot.width) // 2, (s - bot.height) // 2))
    tray_images.append(timg)
write_ico(os.path.join(OUT, "tray.ico"), tray_images)
tray_images[2].save(os.path.join(OUT, "tray-32.png"))
tray_images[0].save(os.path.join(OUT, "tray-16.png"))
tray_images[2].save(os.path.join(OUT, "tray.png"))

# 预览图：深色终端底，两行展示全部表情
labels = [
    ("idle", "待机"), ("blink", "眨眼"), ("wink", "单眼眨"), ("look-left", "看左"), ("look-right", "看右"), ("look-up", "看上"),
    ("happy", "开心"), ("think", "思考"), ("error", "困惑"), ("sleep", "睡觉"), ("dots", "思考点"),
]
preview = Image.new("RGBA", (1320, 560), BG)
pd = ImageDraw.Draw(preview)
font = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 15)
for i, (mode, label) in enumerate(labels):
    col = i % 6
    row = i // 6
    x = 40 + col * 214
    y = 46 + row * 260
    if mode == "dots":
        preview.alpha_composite(dots_image(150), (x, y))
        sw = 150
    else:
        img = bot_image(150, mode)
        preview.alpha_composite(img, (x, y + (150 - img.height) // 2))
        sw = 150
    pd.text((x + sw // 2, y + 200), label, font=font, fill=DIM, anchor="ma")
preview.save(os.path.join(OUT, "robot-frames.png"))

print("assets written")
