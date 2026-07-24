import os
from PIL import Image

webp_dir = r"s:\Dev\Vue\usc-attendance\public\webp"
logo_dir = r"s:\Dev\Vue\usc-attendance\public\logo"

def process_image(file_path):
    print(f"Processing: {file_path}")
    with Image.open(file_path) as img:
        img = img.convert("RGBA")
        width, height = img.size
        pixels = img.load()
        
        # Get corner sample colors
        corners = [pixels[0, 0], pixels[width-1, 0], pixels[0, height-1], pixels[width-1, height-1]]
        
        # Check if corners are near white (r,g,b > 240) or near black (r,g,b < 20) or matching
        center_x, center_y = width / 2.0, height / 2.0
        radius = min(width, height) / 2.0 - 2 # 2px margin inside circle
        
        changed = False
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                dx = x - center_x
                dy = y - center_y
                dist = (dx*dx + dy*dy) ** 0.5
                
                # Check corner color match or outer circle threshold
                is_corner_area = dist > (radius - 1)
                is_near_white = (r > 235 and g > 235 and b > 235)
                is_near_black = (r < 25 and g < 25 and b < 25)
                
                # If outside circle radius and matches near-white or near-black corner background
                if is_corner_area and (is_near_white or is_near_black):
                    pixels[x, y] = (0, 0, 0, 0)
                    changed = True
                elif dist > radius:
                    # Clear anything outside circle if corner background is solid
                    if is_near_white or is_near_black:
                        pixels[x, y] = (0, 0, 0, 0)
                        changed = True

        if changed:
            img.save(file_path, "WEBP", quality=95)
            print(f"  [OK] Removed background for {os.path.basename(file_path)}")

# Process all files in public/webp and public/logo
for folder in [webp_dir, logo_dir]:
    for f in os.listdir(folder):
        if f.endswith(".webp"):
            process_image(os.path.join(folder, f))

# Also check root USC_logo.webp if present
root_usc = r"s:\Dev\Vue\usc-attendance\public\USC_logo.webp"
if os.path.exists(root_usc):
    process_image(root_usc)

print("Done making logos transparent!")
