import zipfile
import os

zip_path = r"C:\Users\lucas\Downloads\TOTUVsVers-oFinal-main (1).zip"
if os.path.exists(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        matches = [n for n in z.namelist() if any(k in n.lower() for k in ["50", "situa", "dpo", "rlhf", "form", "quest", "pergunt", "avaliacao", "experimento"])]
        print(f"Matches in zip ({len(matches)}):")
        for m in matches:
            print(f"  {m}")
else:
    print("Zip not found")
