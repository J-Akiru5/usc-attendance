import os
from PIL import Image

public_dir = r"s:\Dev\Vue\usc-attendance\public"

image_files = [
    r"admin-side angle.png",
    r"admin.png",
    r"library.png",
    r"isufst.jpg",
    r"usc-org-chart-footer.png",
    r"og-image.png",
    r"USC_logo.jpg",
    os.path.join("logo", "Bagong pilipinas logo.png"),
    os.path.join("logo", "ISUFST_logo.png"),
    os.path.join("logo", "USC_logo.jpg")
]

print("=== Converting Images to WebP ===")
total_orig = 0
total_webp = 0

for rel_path in image_files:
    full_path = os.path.join(public_dir, rel_path)
    if not os.path.exists(full_path):
        print(f"Skipping (not found): {rel_path}")
        continue
    
    orig_size = os.path.getsize(full_path)
    total_orig += orig_size
    
    # Target webp path: replace extension with .webp and sanitize spaces if desired
    dir_name, file_name = os.path.split(rel_path)
    base_name, _ = os.path.splitext(file_name)
    sanitized_name = base_name.replace(" ", "-") + ".webp"
    
    target_rel_path = os.path.join(dir_name, sanitized_name)
    target_full_path = os.path.join(public_dir, target_rel_path)
    
    with Image.open(full_path) as img:
        # Convert RGBA/P mode to RGBA or RGB
        if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
            img = img.convert("RGBA")
            img.save(target_full_path, "WEBP", quality=85, method=6)
        else:
            img = img.convert("RGB")
            img.save(target_full_path, "WEBP", quality=85, method=6)
            
    webp_size = os.path.getsize(target_full_path)
    total_webp += webp_size
    
    reduction = (1 - webp_size / orig_size) * 100
    print(f"[OK] {rel_path} -> {target_rel_path}")
    print(f"  Size: {orig_size / 1024:.1f} KB -> {webp_size / 1024:.1f} KB ({reduction:.1f}% reduction)")

print("---------------------------------")
print(f"Total Original: {total_orig / (1024*1024):.2f} MB")
print(f"Total WebP:     {total_webp / (1024*1024):.2f} MB")
print(f"Overall Savings: {(1 - total_webp/total_orig)*100:.1f}% reduction")
