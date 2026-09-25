import os
import sys
from collections import deque
import numpy as np
from PIL import Image, ImageFilter

def extract_and_generate_icons():
    user_uploaded_path = r'C:\Users\20269\.gemini\antigravity\brain\77b657ad-52bc-4afc-9927-efa5ec114e91\.user_uploaded\media_1790321010060.jpg'
    project_root = r'c:\Users\20269\Desktop\项目文件夹\ai 编程工具签到'
    
    if not os.path.exists(user_uploaded_path):
        print(f"Error: user uploaded file not found: {user_uploaded_path}")
        sys.exit(1)
        
    print(f"Loading master source image: {user_uploaded_path}")
    orig = Image.open(user_uploaded_path).convert('RGB')
    w, h = orig.size
    arr = np.array(orig)
    
    # 1. Flood fill detection to cleanly remove outer background
    visited = np.zeros((h, w), dtype=bool)
    seeds = []
    for i in range(12):
        seeds.extend([(i, 0), (w - 1 - i, 0), (i, h - 1), (w - 1 - i, h - 1)])
    queue = deque(seeds)
    for x, y in seeds:
        visited[y, x] = True
        
    while queue:
        cx, cy = queue.popleft()
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = cx + dx, cy + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[ny, nx]:
                p = arr[ny, nx]
                # Outer near-white detection
                if p[0] >= 244 and p[1] >= 244 and p[2] >= 244:
                    visited[ny, nx] = True
                    queue.append((nx, ny))
                    
    # Generate alpha channel
    alpha_raw = np.where(visited, 0, 255).astype(np.uint8)
    alpha_img = Image.fromarray(alpha_raw)
    alpha_smooth = alpha_img.filter(ImageFilter.GaussianBlur(radius=1.2))
    
    rgba = orig.copy().convert('RGBA')
    rgba.putalpha(alpha_smooth)
    
    # Crop to non-transparent bounding box
    bbox = rgba.getbbox()
    cropped = rgba.crop(bbox)
    print(f"Extracted icon bbox: {bbox}, cropped size: {cropped.size}")
    
    # 2. Build 1024x1024 master canvas with optimal 94% squircle occupancy
    master = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    target_h = 940
    ratio = target_h / cropped.height
    target_w = int(cropped.width * ratio)
    resized_master = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    pos_x = (1024 - target_w) // 2
    pos_y = (1024 - target_h) // 2
    master.paste(resized_master, (pos_x, pos_y), resized_master)
    print(f"Master 1024x1024 assembled at ({pos_x}, {pos_y})")
    
    # 3. Target paths definition
    tauri_icons = os.path.join(project_root, 'src-tauri', 'icons')
    public_dir = os.path.join(project_root, 'public')
    assets_dir = os.path.join(project_root, 'src', 'assets')
    os.makedirs(tauri_icons, exist_ok=True)
    os.makedirs(public_dir, exist_ok=True)
    os.makedirs(assets_dir, exist_ok=True)
    
    # Standard PNG sizes for src-tauri/icons
    png_sizes = {
        'icon.png': 1024,
        '512x512.png': 512,
        '256x256.png': 256,
        '128x128@2x.png': 256,
        '128x128.png': 128,
        '64x64.png': 64,
        '48x48.png': 48,
        '32x32.png': 32,
        '16x16.png': 16,
        'Square30x30Logo.png': 30,
        'Square44x44Logo.png': 44,
        'Square71x71Logo.png': 71,
        'Square89x89Logo.png': 89,
        'Square107x107Logo.png': 107,
        'Square142x142Logo.png': 142,
        'Square150x150Logo.png': 150,
        'Square284x284Logo.png': 284,
        'Square310x310Logo.png': 310,
        'StoreLogo.png': 50,
    }
    
    for filename, sz in png_sizes.items():
        out_p = os.path.join(tauri_icons, filename)
        img_resized = master.resize((sz, sz), Image.Resampling.LANCZOS)
        img_resized.save(out_p, 'PNG')
        print(f"Saved: {out_p} ({sz}x{sz})")
        
    # Tray icon
    tray_dir = os.path.join(tauri_icons, 'tray')
    if os.path.exists(tray_dir):
        tray_out = os.path.join(tray_dir, 'status-template.png')
        master.resize((32, 32), Image.Resampling.LANCZOS).save(tray_out, 'PNG')
        print(f"Saved tray icon: {tray_out}")
        
    # iOS icons (if exists)
    ios_dir = os.path.join(tauri_icons, 'ios')
    if os.path.exists(ios_dir):
        for f in os.listdir(ios_dir):
            if f.endswith('.png'):
                fp = os.path.join(ios_dir, f)
                try:
                    cur_sz = Image.open(fp).size
                    master.resize(cur_sz, Image.Resampling.LANCZOS).save(fp, 'PNG')
                except Exception as e:
                    pass
        print("Updated iOS icon assets")

    # Android icons (if exists)
    android_dir = os.path.join(tauri_icons, 'android')
    if os.path.exists(android_dir):
        for root_d, _, files in os.walk(android_dir):
            for f in files:
                if f.endswith('.png'):
                    fp = os.path.join(root_d, f)
                    try:
                        cur_sz = Image.open(fp).size
                        master.resize(cur_sz, Image.Resampling.LANCZOS).save(fp, 'PNG')
                    except Exception as e:
                        pass
        print("Updated Android icon assets")
        
    # Windows Multi-resolution ICO for src-tauri
    ico_path = os.path.join(tauri_icons, 'icon.ico')
    ico_sizes = [(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    master.save(ico_path, format='ICO', sizes=ico_sizes)
    print(f"Saved Windows ICO: {ico_path}")
    
    # macOS ICNS
    icns_path = os.path.join(tauri_icons, 'icon.icns')
    try:
        master.save(icns_path, format='ICNS')
        print(f"Saved macOS ICNS: {icns_path}")
    except Exception as e:
        print(f"Notice: ICNS save returned: {e}")
        
    # Public directory web icons
    pub_icon_png = os.path.join(public_dir, 'icon.png')
    pub_app_icon = os.path.join(public_dir, 'app-icon.png')
    pub_favicon_png = os.path.join(public_dir, 'favicon.png')
    pub_favicon_ico = os.path.join(public_dir, 'favicon.ico')
    
    master.save(pub_icon_png, 'PNG')
    master.resize((512, 512), Image.Resampling.LANCZOS).save(pub_app_icon, 'PNG')
    master.resize((128, 128), Image.Resampling.LANCZOS).save(pub_favicon_png, 'PNG')
    master.save(pub_favicon_ico, format='ICO', sizes=ico_sizes)
    print("Saved public web icons (icon.png, app-icon.png, favicon.png, favicon.ico)")
    
    # Frontend assets direct import
    asset_logo = os.path.join(assets_dir, 'app-logo.png')
    master.resize((512, 512), Image.Resampling.LANCZOS).save(asset_logo, 'PNG')
    print(f"Saved frontend asset logo for direct Vite import: {asset_logo}")
    
    # Update favicon.svg with embedded base64 PNG so any SVG consumer displays identical icon
    import base64
    import io
    buffered = io.BytesIO()
    master.resize((256, 256), Image.Resampling.LANCZOS).save(buffered, format="PNG")
    img_b64 = base64.b64encode(buffered.getvalue()).decode('utf-8')
    svg_content = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">
  <image href="data:image/png;base64,{img_b64}" width="256" height="256" />
</svg>'''
    with open(os.path.join(public_dir, 'favicon.svg'), 'w', encoding='utf-8') as f:
        f.write(svg_content)
    print("Saved public/favicon.svg")
    
    print("All icons successfully generated and updated!")

if __name__ == '__main__':
    extract_and_generate_icons()
