import os
from PIL import Image
from collections import deque

def remove_background(image_path):
    print(f"Cleaning background for: {image_path}")
    with Image.open(image_path) as img:
        img = img.convert("RGBA")
        width, height = img.size
        pixels = img.load()

        center_x = (width - 1) / 2.0
        center_y = (height - 1) / 2.0
        # Radius of the circle
        radius = min(width, height) / 2.0 - 3

        # 1. Flood fill from corners for connected background pixels
        visited = set()
        queue = deque([(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)])
        
        for p in queue:
            visited.add(p)

        def is_bg_pixel(x, y):
            r, g, b, a = pixels[x, y]
            # Check distance from center
            dx = x - center_x
            dy = y - center_y
            dist = (dx*dx + dy*dy) ** 0.5
            
            if dist > radius:
                return True
            
            # If color is solid white or solid black background near border
            if dist > (radius - 12):
                if (r > 230 and g > 230 and b > 230) or (r < 30 and g < 30 and b < 30):
                    return True
            return False

        while queue:
            x, y = queue.popleft()
            pixels[x, y] = (0, 0, 0, 0)

            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                    if is_bg_pixel(nx, ny):
                        visited.add((nx, ny))
                        queue.append((nx, ny))

        # 2. Also hard-clip anything outside the radius
        for y in range(height):
            for x in range(width):
                dx = x - center_x
                dy = y - center_y
                dist = (dx*dx + dy*dy) ** 0.5
                if dist > (radius + 2):
                    pixels[x, y] = (0, 0, 0, 0)

        img.save(image_path, "WEBP", quality=95)
        print(f"  [SUCCESS] Cleaned {os.path.basename(image_path)}")

# Target logo files
logo_files = [
    r"s:\Dev\Vue\usc-attendance\public\webp\1.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\2.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\3.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\4.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\5.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\6.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\7.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\8.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\9.webp",
    r"s:\Dev\Vue\usc-attendance\public\webp\isufst_logo.webp",
    r"s:\Dev\Vue\usc-attendance\public\logo\Bagong-pilipinas-logo.webp",
    r"s:\Dev\Vue\usc-attendance\public\logo\ISUFST_logo.webp",
    r"s:\Dev\Vue\usc-attendance\public\logo\USC_logo.webp",
    r"s:\Dev\Vue\usc-attendance\public\USC_logo.webp",
]

for file_path in logo_files:
    if os.path.exists(file_path):
        remove_background(file_path)

print("Finished floodfill background removal for all logos!")
