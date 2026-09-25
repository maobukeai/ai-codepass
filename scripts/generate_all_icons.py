import os
import sys
from PIL import Image

source_png = r"C:\Users\20269\.gemini\antigravity\brain\77b657ad-52bc-4afc-9927-efa5ec114e91\.system_generated\steps\2332\media_0.png"
if not os.path.exists(source_png):
    print(f"Error: source image not found at {source_png}")
    sys.exit(1)

base_img = Image.open(source_png).convert("RGBA")
print(f"Loaded source image: {base_img.size}")

project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
tauri_icons = os.path.join(project_root, "src-tauri", "icons")
public_dir = os.path.join(project_root, "public")
tray_dir = os.path.join(tauri_icons, "tray")
os.makedirs(tray_dir, exist_ok=True)
os.makedirs(public_dir, exist_ok=True)

# Standard Tauri icon sizes
sizes = {
    "16x16.png": 16,
    "32x32.png": 32,
    "48x48.png": 48,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "256x256.png": 256,
    "512x512.png": 512,
    "icon.png": 1024,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png": 50,
}

for filename, sz in sizes.items():
    resized = base_img.resize((sz, sz), Image.Resampling.LANCZOS)
    target_path = os.path.join(tauri_icons, filename)
    resized.save(target_path, "PNG")
    print(f"Generated {target_path} ({sz}x{sz})")

# Tray icon
tray_icon = base_img.resize((32, 32), Image.Resampling.LANCZOS)
tray_path = os.path.join(tray_dir, "status-template.png")
tray_icon.save(tray_path, "PNG")
print(f"Generated {tray_path}")

# Public web assets
public_files = {
    "app-icon.png": 512,
    "icon.png": 512,
    "favicon.png": 128,
}
for filename, sz in public_files.items():
    resized = base_img.resize((sz, sz), Image.Resampling.LANCZOS)
    target_path = os.path.join(public_dir, filename)
    resized.save(target_path, "PNG")
    print(f"Generated {target_path}")

# Windows Multi-resolution ICO file
ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
tauri_ico_path = os.path.join(tauri_icons, "icon.ico")
public_ico_path = os.path.join(public_dir, "favicon.ico")

base_img.save(tauri_ico_path, format="ICO", sizes=ico_sizes)
print(f"Generated multi-size ICO: {tauri_ico_path}")

base_img.save(public_ico_path, format="ICO", sizes=ico_sizes)
print(f"Generated multi-size ICO: {public_ico_path}")

# Copy into evidence
evidence_dir = os.path.join(project_root, ".mission", "evidence")
os.makedirs(evidence_dir, exist_ok=True)
base_img.resize((512, 512), Image.Resampling.LANCZOS).save(os.path.join(evidence_dir, "apple_squircle_app_icon_512.png"), "PNG")

print("All application icons, Windows ICO, tray templates and web favicons successfully regenerated!")
