"""
generate_apple_icons.py
Generate high-fidelity Apple-style Squircle icon assets for AI CodePass.
Generates:
- 1024x1024 master icon
- 512, 256, 128, 64, 48, 32, 16 PNGs
- icon.ico (multi-size Windows ICO)
- Square* Windows Store logos
- public/favicon.svg, public/logo.svg, public/app-icon.png
"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")
PUBLIC_DIR = os.path.join(os.path.dirname(__file__), "..", "public")
ASSETS_DIR = os.path.join(os.path.dirname(__file__), "..", "src", "assets")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(ASSETS_DIR, exist_ok=True)

SIZE = 1024

def create_apple_squircle_mask(size, radius_ratio=0.223):
    """Creates a smooth anti-aliased Apple squircle mask using supersampling."""
    ss = 2  # supersampling
    w = size * ss
    h = size * ss
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    r = int(w * radius_ratio)
    draw.rounded_rectangle([0, 0, w - 1, h - 1], radius=r, fill=255)
    mask = mask.resize((size, size), Image.Resampling.LANCZOS)
    return mask

def draw_apple_master_icon():
    # 1. Base gradient canvas (Midnight dark blue space)
    base = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    # 45-degree rich gradient
    for y in range(SIZE):
        for x in range(SIZE):
            t = (x * 0.45 + y * 0.85) / SIZE
            # Gradient from deep dark sapphire to midnight indigo
            r = int(10 + (22 - 10) * t)
            g = int(14 + (34 - 14) * t)
            b = int(28 + (65 - 28) * t)
            draw.point((x, y), fill=(r, g, b, 255))

    # 2. Add subtle top-down inner highlight (Apple specular sheen)
    sheen = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(sheen)
    # Radial sheen at top center
    cx, cy = SIZE // 2, int(SIZE * 0.15)
    for rad in range(int(SIZE * 0.65), 0, -3):
        alpha = int(45 * (1 - rad / (SIZE * 0.65)))
        sdraw.ellipse([cx - rad, cy - int(rad * 0.6), cx + rad, cy + int(rad * 0.6)], fill=(120, 180, 255, alpha))
    
    sheen = sheen.filter(ImageFilter.GaussianBlur(12))
    base = Image.alpha_composite(base, sheen)

    # 3. Ambient glow behind the central badge
    glow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gcx, gcy = SIZE // 2, int(SIZE * 0.52)
    for rad in range(int(SIZE * 0.4), 0, -4):
        t = 1 - rad / (SIZE * 0.4)
        alpha = int(80 * (t ** 1.8))
        # Blue to Purple-Cyan ambient glow
        r = int(0 + 130 * t)
        g = int(120 + 70 * t)
        b = int(255)
        gdraw.ellipse([gcx - rad, gcy - rad, gcx + rad, gcy + rad], fill=(r, g, b, alpha))
    
    glow = glow.filter(ImageFilter.GaussianBlur(28))
    base = Image.alpha_composite(base, glow)

    # 4. Central Emblem: Passkey Badge + Code brackets
    # Draw floating rounded card (The "Pass") in the center
    card = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    card_w = int(SIZE * 0.58)
    card_h = int(SIZE * 0.58)
    x0 = (SIZE - card_w) // 2
    y0 = int(SIZE * 0.22)
    x1 = x0 + card_w
    y1 = y0 + card_h
    card_r = int(card_w * 0.22)

    # Card shadow
    c_shadow = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    csdraw = ImageDraw.Draw(c_shadow)
    csdraw.rounded_rectangle([x0, y0 + 20, x1, y1 + 20], radius=card_r, fill=(0, 0, 0, 110))
    c_shadow = c_shadow.filter(ImageFilter.GaussianBlur(24))
    base = Image.alpha_composite(base, c_shadow)

    # Card gradient background: Glassmorphism / deep vibrant blue-violet
    card_surface = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    csurf_draw = ImageDraw.Draw(card_surface)
    for iy in range(y0, y1 + 1):
        pt = (iy - y0) / (y1 - y0)
        cr = int(25 + 20 * pt)
        cg = int(32 + 55 * pt)
        cb = int(68 + 120 * pt)
        csurf_draw.line([(x0, iy), (x1, iy)], fill=(cr, cg, cb, 235))
    
    # Clip card to squircle
    c_mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(c_mask).rounded_rectangle([x0, y0, x1, y1], radius=card_r, fill=255)
    card_surface.putalpha(c_mask)

    # Inner subtle rim light on card
    c_border = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    cbdraw = ImageDraw.Draw(c_border)
    cbdraw.rounded_rectangle([x0, y0, x1, y1], radius=card_r, outline=(140, 200, 255, 140), width=4)
    # top highlight line
    cbdraw.line([(x0 + card_r, y0 + 2), (x1 - card_r, y0 + 2)], fill=(255, 255, 255, 180), width=4)

    card_surface = Image.alpha_composite(card_surface, c_border)
    base = Image.alpha_composite(base, card_surface)

    # 5. Core CodePass Icon Symbols:
    # Beautiful Glowing Code Brackets `< / >` + Keyhole / Pass Shield
    symbols = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    sydraw = ImageDraw.Draw(symbols)

    mid_x = SIZE // 2
    mid_y = y0 + card_h // 2

    # Left bracket `<`
    lb_points = [
        (mid_x - 130, mid_y),
        (mid_x - 65, mid_y - 85),
        (mid_x - 45, mid_y - 68),
        (mid_x - 95, mid_y),
        (mid_x - 45, mid_y + 68),
        (mid_x - 65, mid_y + 85),
    ]
    sydraw.polygon(lb_points, fill=(240, 248, 255, 250))

    # Right bracket `>`
    rb_points = [
        (mid_x + 130, mid_y),
        (mid_x + 65, mid_y - 85),
        (mid_x + 45, mid_y - 68),
        (mid_x + 95, mid_y),
        (mid_x + 45, mid_y + 68),
        (mid_x + 65, mid_y + 85),
    ]
    sydraw.polygon(rb_points, fill=(240, 248, 255, 250))

    # Center Key / Passkey Shield / Lightning Bolt (Pass Symbol)
    # Forward slash code divider transformed into luminous cyan-to-electric-blue passkey beam
    slash_points = [
        (mid_x + 22, mid_y - 105),
        (mid_x + 44, mid_y - 105),
        (mid_x - 22, mid_y + 105),
        (mid_x - 44, mid_y + 105),
    ]
    # Draw center slash with vibrant cyan-green gradient
    sydraw.polygon(slash_points, fill=(0, 235, 255, 255))

    # Glowing Pass Sparkle at the center of the slash
    sparkle_r = 18
    sydraw.ellipse([mid_x - sparkle_r, mid_y - sparkle_r, mid_x + sparkle_r, mid_y + sparkle_r], fill=(255, 255, 255, 255))

    # Three dots at the bottom of the card representing the 3 tools (CodeBuddy, Qoder, Trae)
    dot_y = y1 - 42
    dot_colors = [
        (56, 189, 248, 240),   # CodeBuddy Cyan
        (168, 85, 247, 240),   # Qoder Purple
        (34, 197, 94, 240)     # Trae Emerald Green
    ]
    dot_spacing = 38
    for i, color in enumerate(dot_colors):
        dx = mid_x + (i - 1) * dot_spacing
        sydraw.ellipse([dx - 7, dot_y - 7, dx + 7, dot_y + 7], fill=color)

    # Soft glow around the symbols
    symbols_glow = symbols.filter(ImageFilter.GaussianBlur(14))
    base = Image.alpha_composite(base, symbols_glow)
    base = Image.alpha_composite(base, symbols)

    # 6. Apply master Apple Squircle mask
    squircle_mask = create_apple_squircle_mask(SIZE, radius_ratio=0.223)
    
    # 7. Add Apple Border Ring (1px crisp highlight rim around squircle)
    rim = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    rdraw = ImageDraw.Draw(rim)
    rdraw.rounded_rectangle([2, 2, SIZE - 3, SIZE - 3], radius=int(SIZE * 0.223), outline=(255, 255, 255, 55), width=3)
    
    # Top highlight sheen on the outer rim
    rdraw.line([(int(SIZE * 0.22), 2), (int(SIZE * 0.78), 2)], fill=(255, 255, 255, 130), width=3)
    base = Image.alpha_composite(base, rim)

    final_icon = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    final_icon.paste(base, (0, 0), squircle_mask)

    return final_icon

def generate_all_assets():
    print("Generating Master 1024x1024 Apple Squircle icon...")
    master = draw_apple_master_icon()

    # Save master 1024
    master_path = os.path.join(OUTPUT_DIR, "icon.png")
    master.save(master_path, "PNG", optimize=True)
    print(f"Saved: {master_path}")

    # Generate standard PNG icons
    sizes = [512, 256, 128, 64, 48, 32, 16]
    ico_images = []
    for s in sizes:
        resized = master.resize((s, s), Image.Resampling.LANCZOS)
        out_path = os.path.join(OUTPUT_DIR, f"{s}x{s}.png")
        resized.save(out_path, "PNG", optimize=True)
        ico_images.append(resized)
        if s == 128:
            retina_path = os.path.join(OUTPUT_DIR, "128x128@2x.png")
            master.resize((256, 256), Image.Resampling.LANCZOS).save(retina_path, "PNG", optimize=True)

    # Generate icon.ico (including all standard Windows icon sizes)
    ico_path = os.path.join(OUTPUT_DIR, "icon.ico")
    ico_images[0].save(
        ico_path,
        format="ICO",
        sizes=[(s, s) for s in [256, 128, 64, 48, 32, 16]],
        append_images=ico_images[1:]
    )
    print(f"Saved: {ico_path}")

    # Windows Store Square icons
    square_sizes = [
        ("Square30x30Logo.png", 30),
        ("Square44x44Logo.png", 44),
        ("Square71x71Logo.png", 71),
        ("Square89x89Logo.png", 89),
        ("Square107x107Logo.png", 107),
        ("Square142x142Logo.png", 142),
        ("Square150x150Logo.png", 150),
        ("Square284x284Logo.png", 284),
        ("Square310x310Logo.png", 310),
        ("StoreLogo.png", 50),
    ]
    for filename, s in square_sizes:
        sq_path = os.path.join(OUTPUT_DIR, filename)
        master.resize((s, s), Image.Resampling.LANCZOS).save(sq_path, "PNG", optimize=True)

    # Save to public directory for Web / Tauri Frontend
    web_icon_512 = os.path.join(PUBLIC_DIR, "app-icon.png")
    master.resize((512, 512), Image.Resampling.LANCZOS).save(web_icon_512, "PNG", optimize=True)
    web_icon_32 = os.path.join(PUBLIC_DIR, "favicon.png")
    master.resize((32, 32), Image.Resampling.LANCZOS).save(web_icon_32, "PNG", optimize=True)

    print("All Apple-style icon assets successfully generated!")

if __name__ == "__main__":
    generate_all_assets()
