#!/usr/bin/env python3
"""
Helix rebrand — user-visible string replacement (Pentaho -> Helix).

Scope: display text only. This does NOT touch:
  - property KEYS (left of the first '=' in .properties)
  - comment lines (# ... in .properties, <!-- --> only-lines, // lines)
  - Java package / import / FQCN tokens  (org.pentaho., com.pentaho., pentaho.)
  - URLs and namespace URIs on the EXCLUDE list (JCR, reporting-engine, schema,
    pentaho.com/pentaho.org hostnames -> handled in a later URL slice)
  - Maven coordinates / bean class= / id=  (later slices)
  - copyright / license header lines        (legal slice 4f)

Case-preserving:  Pentaho->Helix, PENTAHO->HELIX, pentaho->helix

Usage:
  rebrand-strings.py --check  <file|glob> ...     # dry-run, show diffs
  rebrand-strings.py --apply  <file|glob> ...     # write changes
"""
import sys, re, glob, os

EXCLUDE_LINE_SUBSTR = (
    "org.pentaho", "com.pentaho", "pentaho.com", "pentaho.org",
    "www.pentaho", "/pentaho-style/", "schema/pentaho-system", "pentaho-gwt-rpc",
    "http://reporting.pentaho", "jcr/2.0",
    # identifiers renamed (or not) in later slices, not here:
    "pentaho.xml", "pentaho-system-cfg", "pentaho-solutions", "pentaho.war",
    "pentaho-server", "pentaho-style.war", "PENTAHO_", "pentaho_mapping",
    'class="org.', "class='org.", "<classname>", "Bundle-",
)
EXCLUDE_LINE_RE = re.compile(
    r"(?i)copyright|all rights reserved|licensed under|LICENSE\.TXT|"
    r"GNU (Lesser )?General Public|Business Source License|&copy;|©|"
    r"保留.{0,4}(權利|权利)|"        # zh "all rights reserved"
    r"全著作権所有|"                  # zh-TW
    r"Alle Rechte|Tous [Dd]roits|Todos los derechos|Wszelkie prawa|"
    r"著作権所有|"
    r"^\s*[#*]|^\s*//|^\s*<!--"
)

# case-preserving token replace, only on standalone-ish 'pentaho'
def repl_token(m):
    t = m.group(0)
    if t.isupper():
        return "HELIX"
    if t[0].isupper():
        return "Helix"
    return "helix"

# 'pentaho' as a brand word: not part of a package (org.pentaho), not a class
# prefix (PentahoSystem, IPentahoSession), not a hyphenated identifier token
# used as code. Followed by whitespace / punctuation / end only.
# preceded by: not a letter / '.' / '/'  (so 'org.pentaho', 'myPentaho' are out,
#   but '、Pentaho' in a .properties value and 'word Pentaho' are in)
# followed by: not a letter / digit / '_' / '/'  (so 'PentahoSystem', 'pentaho/x'
#   are out, 'Pentaho ', 'Pentaho.', 'Pentaho-X', 'Pentaho<' are in)
# Not preceded by: '.' '/', or 2+ consecutive ASCII letters (mid-identifier like
#   'myPentaho'). A single char before (incl. the trailing hex of a \uXXXX escape
#   in a .properties value, e.g. '，Pentaho') is fine.
# Not followed by: letter / digit / '_' / '/'  ('PentahoSystem', 'pentaho/x' out).
TOKEN_RE = re.compile(
    r"(?<!\.)(?<!/)(?<![A-Za-z][A-Za-z])[Pp][Ee][Nn][Tt][Aa][Hh][Oo](?![A-Za-z0-9_/])"
)
KEY_EXCLUDE = ("COPYRIGHT", "USER_ABOUT_TEXT", "LICENSE", "GPL", "LGPL")

CASE_SENSITIVE_EXCL = ("PENTAHO_", "HELIX_")

def _excluded(text):
    if EXCLUDE_LINE_RE.search(text):
        return True
    low = text.lower()
    if any(s.lower() in low for s in EXCLUDE_LINE_SUBSTR if s not in CASE_SENSITIVE_EXCL):
        return True
    return any(s in text for s in CASE_SENSITIVE_EXCL)

def transform_line(line, is_properties):
    if is_properties and "=" in line and not line.lstrip().startswith(("#", "!")):
        # never rename the KEY (it is an API contract); test the VALUE only
        key, _, val = line.partition("=")
        if any(k in key.upper() for k in KEY_EXCLUDE) or _excluded(val):
            return line
        return key + "=" + TOKEN_RE.sub(repl_token, val)
    if _excluded(line):
        return line
    return TOKEN_RE.sub(repl_token, line)

def process(path, apply):
    is_props = path.endswith(".properties")
    try:
        # newline="" -> no newline translation: \r\n / \n preserved exactly on
        # read and write, so a rebrand of one value never rewrites the whole file
        with open(path, "r", encoding="utf-8", newline="") as f:
            orig = f.readlines()
    except (UnicodeDecodeError, IsADirectoryError):
        return 0
    new = [transform_line(l, is_props) for l in orig]
    if new == orig:
        return 0
    if apply:
        with open(path, "w", encoding="utf-8", newline="") as f:
            f.writelines(new)
    else:
        for i, (a, b) in enumerate(zip(orig, new)):
            if a != b:
                print(f"  {path}:{i+1}")
                print(f"    - {a.rstrip()}")
                print(f"    + {b.rstrip()}")
    return sum(1 for a, b in zip(orig, new) if a != b)

def main():
    if len(sys.argv) < 3 or sys.argv[1] not in ("--check", "--apply"):
        print(__doc__); sys.exit(2)
    apply = sys.argv[1] == "--apply"
    total, files = 0, 0
    for pat in sys.argv[2:]:
        for path in sorted(glob.glob(pat, recursive=True)):
            if not os.path.isfile(path):
                continue
            n = process(path, apply)
            if n:
                total += n
                files += 1
    print(f"\n{'applied' if apply else 'would change'} {total} line(s) in {files} file(s)")

if __name__ == "__main__":
    main()
