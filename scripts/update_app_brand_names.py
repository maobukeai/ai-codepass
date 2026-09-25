"""
update_app_brand_names.py
Safely replace obsolete Cockpit brand names with AI CodePass across all locales.
"""
import glob
import re

def update_locale_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replace "Cockpit Tools" or "cockpit-tools"
    updated = re.sub(r'Cockpit\s+Tools', 'AI CodePass', content)
    updated = re.sub(r'cockpit-tools', 'ai-codepass', updated)
    # Replace standalone "Cockpit" when used as the app name
    updated = re.sub(r'\bCockpit\b', 'AI CodePass', updated)

    if updated != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(updated)
        print(f"Updated: {filepath}")

for f in glob.glob('src/locales/*.json'):
    update_locale_file(f)

print("All locale files updated to AI CodePass successfully!")
