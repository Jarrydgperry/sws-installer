filepath = r'c:\Users\USER-PC\Desktop\Backups\simworks-installer-demo\src\index.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

changes = 0

# 1. Add logging after getPackageVersion results are resolved
old1 = """      const res = await Promise.all(tasks);
      if (cancelled) return;
      setInstalledVers(prev => {
        const next = { ...prev };
        for (const r of res) if (r.v) next[r.key] = r.v;
        return next;
      });"""
new1 = """      const res = await Promise.all(tasks);
      console.debug('[SWS-VERSION-DEBUG] getPackageVersion results for product:', product?.id, product?.name,
        '\\n  tasks resolved:', res,
        '\\n  folder20:', typeof folder20 !== 'undefined' ? folder20 : 'N/A',
        '\\n  folder24:', typeof folder24 !== 'undefined' ? folder24 : 'N/A'
      );
      if (cancelled) return;
      setInstalledVers(prev => {
        const next = { ...prev };
        for (const r of res) if (r.v) next[r.key] = r.v;
        return next;
      });"""

if old1 in content:
    content = content.replace(old1, new1, 1)
    changes += 1
    print('1. Added logging after Promise.all resolution')
else:
    print('1. SKIP: Promise.all pattern not found')

# 2. Also add debug logging in the version display/button area
# Find where installed2020Version is used in the button
old2 = """  // [DEBUG] Trace final version values
  if (product?.id) {
    console.debug('[SWS-VERSION-DEBUG] Product:', product.id, product.name,
      '\\n  installedVers:', installedVers,
      '\\n  installed2020Version:', installed2020Version,
      '\\n  installed2024Version:', installed2024Version
    );
  }"""
if old2 in content:
    print('2. SKIP: final version debug already exists')
else:
    print('2. INFO: final version debug not found (may need different check)')

# 3. Add logging inside findInstalledFor to trace what it returns
old3 = "  function findInstalledFor(installPath, simKey) {"
new3 = """  function findInstalledFor(installPath, simKey) {
    console.debug('[SWS-FIND-DEBUG] findInstalledFor called for product:', product?.id, product?.name, 'simKey:', simKey, 'installPath:', installPath);"""
if old3 in content:
    content = content.replace(old3, new3, 1)
    changes += 1
    print('3. Added findInstalledFor entry logging')
else:
    print('3. SKIP: findInstalledFor not found')

# 4. Find the return of findInstalledFor and add logging there
# Need to find the actual return
import re
# Find the function body - look for the return at the end
pattern = r'(function findInstalledFor\(installPath, simKey\).*?)(return sorted\[0\])'
m = re.search(pattern, content, re.DOTALL)
if m:
    # Replace 'return sorted[0]' with logging + return
    old4 = m.group(2)
    idx = m.start(2)
    # Check context
    snippet = content[idx:idx+50]
    print(f'4. Found return sorted[0] at offset {idx}: {repr(snippet[:50])}')
else:
    print('4. INFO: Could not find return sorted[0] pattern')

with open(filepath, 'w', encoding='utf-8', newline='\n') as f:
    f.write(content)

print(f'\nTotal changes: {changes}')
