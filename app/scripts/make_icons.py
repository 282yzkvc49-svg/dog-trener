#!/usr/bin/env python3
"""
Генерирует все иконки PWA для iPad/iPhone в папку приложения (плоско, без подпапок).

Режим 1 — символ на градиенте (работает всегда, нужен только Pillow):
    python3 make_icons.py APP_DIR --text "₽" --bg "#0f766e" --bg2 "#14b8a6" --fg "#ffffff"

Режим 2 — своя SVG (нужен cairosvg, rsvg-convert, inkscape или ImageMagick с поддержкой SVG):
    python3 make_icons.py APP_DIR --svg icon.svg --bg "#0f766e"

Создаёт: apple-touch-icon.png (180, без прозрачности), icon-192.png, icon-512.png,
icon-maskable-512.png (символ в безопасной зоне), favicon-32.png.

iOS сам скругляет углы и заливает прозрачность чёрным, поэтому иконка — квадрат на всю площадь.
"""
import argparse
import io
import os
import shutil
import subprocess
import sys
import tempfile

from PIL import Image, ImageDraw, ImageFont

MASTER = 1024

FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
]


def hex_rgb(value):
    v = value.strip().lstrip("#")
    if len(v) == 3:
        v = "".join(c * 2 for c in v)
    if len(v) != 6:
        raise ValueError(f"Цвет должен быть в формате #RRGGBB: {value}")
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def gradient(size, c1, c2):
    """Диагональный градиент от левого верхнего угла к правому нижнему."""
    small = 256
    img = Image.new("RGB", (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * (small - 1))
            px[x, y] = tuple(round(a + (b - a) * t) for a, b in zip(c1, c2))
    return img.resize((size, size), Image.BICUBIC)


def find_font(path=None):
    for p in ([path] if path else []) + FONT_CANDIDATES:
        if p and os.path.exists(p):
            return p
    return None


def draw_text_icon(text, bg, bg2, fg, scale, font_path):
    img = gradient(MASTER, bg, bg2) if bg2 else Image.new("RGB", (MASTER, MASTER), bg)
    fp = find_font(font_path)
    if not fp:
        sys.exit("Не найден шрифт. Укажите --font путь/к/шрифту.ttf")
    target = MASTER * scale
    # Подбираем размер шрифта так, чтобы символ занял ~scale от стороны иконки.
    size = int(target)
    for _ in range(12):
        font = ImageFont.truetype(fp, size)
        l, t, r, b = font.getbbox(text)
        w, h = r - l, b - t
        biggest = max(w, h) or 1
        if abs(biggest - target) < 4:
            break
        size = max(8, int(size * target / biggest))
    font = ImageFont.truetype(fp, size)
    l, t, r, b = font.getbbox(text)
    w, h = r - l, b - t
    d = ImageDraw.Draw(img)
    d.text(((MASTER - w) / 2 - l, (MASTER - h) / 2 - t), text, font=font, fill=fg)
    return img


def render_svg(svg_path, size):
    """Пробует доступные рендереры SVG. Возвращает RGBA Image или None."""
    try:
        import cairosvg  # type: ignore
        data = cairosvg.svg2png(url=svg_path, output_width=size, output_height=size)
        return Image.open(io.BytesIO(data)).convert("RGBA")
    except Exception:
        pass
    with tempfile.TemporaryDirectory() as tmp:
        out = os.path.join(tmp, "out.png")
        commands = []
        if shutil.which("rsvg-convert"):
            commands.append(["rsvg-convert", "-w", str(size), "-h", str(size), svg_path, "-o", out])
        if shutil.which("inkscape"):
            commands.append(["inkscape", svg_path, "--export-type=png", f"--export-filename={out}",
                             "-w", str(size), "-h", str(size)])
        for tool in ("magick", "convert"):
            if shutil.which(tool):
                commands.append([tool, "-background", "none", "-density", "384", svg_path,
                                 "-resize", f"{size}x{size}", out])
        for cmd in commands:
            try:
                subprocess.run(cmd, check=True, capture_output=True, timeout=60)
                if os.path.exists(out) and os.path.getsize(out) > 0:
                    img = Image.open(out).convert("RGBA")
                    if img.size != (size, size):
                        img = img.resize((size, size), Image.LANCZOS)
                    return img
            except Exception:
                continue
    return None


def flatten(img, bg):
    """Убирает прозрачность: iOS заливает её чёрным."""
    if img.mode != "RGBA":
        return img.convert("RGB")
    base = Image.new("RGB", img.size, bg)
    base.paste(img, mask=img.split()[3])
    return base


def main():
    ap = argparse.ArgumentParser(description="Иконки PWA для iPad/iPhone")
    ap.add_argument("app_dir", help="папка приложения (иконки ложатся в её корень)")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="символ или 1–2 буквы (цветные эмодзи не поддерживаются)")
    src.add_argument("--svg", help="путь к квадратной SVG-иконке")
    ap.add_argument("--bg", default="#2563eb", help="цвет фона, #RRGGBB")
    ap.add_argument("--bg2", help="второй цвет для диагонального градиента (необязательно)")
    ap.add_argument("--fg", default="#ffffff", help="цвет символа")
    ap.add_argument("--scale", type=float, default=0.56, help="размер символа относительно иконки")
    ap.add_argument("--font", help="свой шрифт .ttf/.otf")
    args = ap.parse_args()

    os.makedirs(args.app_dir, exist_ok=True)
    bg, fg = hex_rgb(args.bg), hex_rgb(args.fg)
    bg2 = hex_rgb(args.bg2) if args.bg2 else None

    if args.text:
        master = draw_text_icon(args.text, bg, bg2, fg, args.scale, args.font)
        # Для maskable символ меньше: Android обрезает края кругом/каплей (безопасная зона ~80%).
        maskable = draw_text_icon(args.text, bg, bg2, fg, min(args.scale, 0.42), args.font)
    else:
        if not os.path.exists(args.svg):
            sys.exit(f"Нет файла: {args.svg}")
        rendered = render_svg(args.svg, MASTER)
        if rendered is None:
            sys.exit("Нечем отрисовать SVG (нет cairosvg / rsvg-convert / inkscape / ImageMagick с SVG). "
                     "Используйте режим --text.")
        master = flatten(rendered, bg)
        inner = int(MASTER * 0.72)
        maskable = gradient(MASTER, bg, bg2) if bg2 else Image.new("RGB", (MASTER, MASTER), bg)
        small = rendered.resize((inner, inner), Image.LANCZOS)
        off = (MASTER - inner) // 2
        maskable.paste(flatten(small, bg), (off, off))

    outputs = {
        "apple-touch-icon.png": (master, 180),
        "icon-192.png": (master, 192),
        "icon-512.png": (master, 512),
        "icon-maskable-512.png": (maskable, 512),
        "favicon-32.png": (master, 32),
    }
    for name, (img, size) in outputs.items():
        out = img.convert("RGB").resize((size, size), Image.LANCZOS)
        out.save(os.path.join(args.app_dir, name), optimize=True)
        print(f"  ✓ {name} {size}×{size}")
    print("Готово. Посмотрите icon-512.png перед сдачей.")


if __name__ == "__main__":
    main()
