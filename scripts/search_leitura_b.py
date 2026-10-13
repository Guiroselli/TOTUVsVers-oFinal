import os
import glob

downloads_dir = r"C:\Users\lucas\Downloads"
for root, dirs, files in os.walk(downloads_dir):
    for f in files:
        path = os.path.join(root, f)
        if f.endswith(('.txt', '.html', '.csv', '.json', '.js', '.py', '.md')):
            try:
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    content = fp.read()
                    if 'Leitura B' in content:
                        print(f"Found 'Leitura B' in: {path} (matches: {content.count('Leitura B')})")
            except Exception as e:
                pass
