filepath = r'c:\Users\USER-PC\Desktop\Backups\simworks-installer-demo\src\index.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Find the comment line and replace the sort section
import re

# Match from after the .sort  opening through the panel prefix check
old_pattern = r"(      const bName = String\(B\.folder \|\| B\.name \|\| ''\)\.toLowerCase\(\);\n)      // Prefer non panel-mod folders.*?when choosing installed item\n(      const aIsPanelPrefix)"
new_text = r"""\1      // Highest priority: prefer the canonical base folder (product.bunny.folder) over everything else
      const aIsCanonical = canonicalFolder && aName === canonicalFolder ? 1 : 0;
      const bIsCanonical = canonicalFolder && bName === canonicalFolder ? 1 : 0;
      if (aIsCanonical !== bIsCanonical) return bIsCanonical - aIsCanonical;
      // Prefer non panel-mod folders (don't pick folders that start with a single letter then -)
\2"""

m = re.search(old_pattern, content, re.DOTALL)
if m:
    content = content[:m.start()] + re.sub(old_pattern, new_text, m.group(0)) + content[m.end():]
    print('Added canonical folder priority to sort')
else:
    print('ERROR: Could not find sort section')
    # Debug
    idx = content.find('Prefer non panel-mod folders')
    if idx >= 0:
        print(f'Found comment at offset {idx}')
        print(repr(content[idx:idx+80]))

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)
print('Done')
