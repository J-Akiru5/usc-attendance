import os
from PIL import Image
from collections import deque

def remove_exact_bg(image_path):
    print(f"Cleaning exact background for: {image_path}")
    with Image.open(image_path) as img:
        img = img.convert("RGBA")
        width, height = img.size
        pixels = img.load()

        # Seed from all 4 corners
        corners = [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]
        
        # Collect initial background colors
        bg_colors = [pixels[c[0], c[1]] for c in corners]
        
        def is_color_match(p, bg):
            # Check RGB Euclidean distance
            dr = p[0] - bg[0]
            dg = p[1] - bg[1]
            db = p[2] - bg[2]
            return (dr*dr + dg*dg + db*db) < (45 * 45)

        visited = set()
        queue = deque(corners)
        for c in corners:
            visited.add(c)

        while queue:
            x, y = queue.popleft()
            curr = pixels[x, y]
            
            # Make transparent
            pixels[x, y] = (0, 0, 0, 0)

            for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nx, ny = x + dx, y + dy
                if 0 <= nx < width and 0 <= ny < height and (nx, ny) not in visited:
                    p = pixels[nx, ny]
                    # If pixel matches any corner background color or is pure white/black near border
                    if any(is_color_match(p, bg) for bg in bg_colors) or (p[0]>245 and p[1]>245 and p[2]>245) or (p[0]<20 and p[1]<20 and p[2]<20):
                        visited.add((nx, ny))
                        queue.append((nx, ny))

        img.save(image_path, "WEBP", quality=95)
        print(f"  [SUCCESS] Finished {os.path.basename(image_path)}")

# Target webp files
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
        remove_exact_bg(file_path)

print("Exact background removal finished!")
