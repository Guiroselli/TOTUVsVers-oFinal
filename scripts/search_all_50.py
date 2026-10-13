import os

search_phrase = "central TOTVS imediatamente"
search_dirs = [
    r"C:\Users\lucas\Desktop",
    r"C:\Users\lucas\Documents",
    r"C:\Users\lucas\Downloads",
    r"C:\Users\lucas\Projetos",
    r"C:\Users\lucas\.gemini\antigravity"
]

print("Searching for files with full 50 situations text...")
for base in search_dirs:
    if not os.path.exists(base):
        continue
    for root, dirs, files in os.walk(base):
        # Skip node_modules and .git
        if "node_modules" in root or ".git" in root or ".venv" in root:
            continue
        for f in files:
            if f.endswith(('.txt', '.html', '.csv', '.json', '.js', '.py', '.md', '.docx', '.pdf', '.xlsx')):
                path = os.path.join(root, f)
                try:
                    with open(path, "r", encoding="utf-8", errors="ignore") as fp:
                        txt = fp.read()
                        if search_phrase in txt:
                            print(f"Found match: {path}")
                except Exception:
                    pass
print("Search complete.")
