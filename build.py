#!/usr/bin/env python3
# build.py — Hollybrook Open builder (ARCH §2).
# Concatenates src/ files (fixed order, missing files skipped with a note) into ONE
# self-contained page, all JS wrapped in a single IIFE.
#   python3 build.py            -> dist/hollybrook-open.html          (three.js via cdnjs)
#   python3 build.py --offline  -> dist/hollybrook-open-offline.html  (vendor/ inlined)
# Runs dupcheck first; any violation fails the build.
import argparse, os, sys
import dupcheck

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')
VENDOR = os.path.join(ROOT, 'vendor', 'three.r128.min.js')

MANIFEST = [
    # core (debug.js early so error hooks catch later boot failures)
    'cfg.js', 'debug.js', 'util.js', 'core-bus.js',
    'core-sched.js', 'core-pipeline.js', 'core-camera.js', 'core-light.js', 'core-nav.js',
    # world
    'court.js', 'grounds.js', 'club.js', 'people.js', 'kin.js', 'ball.js',
    'rally.js', 'flow.js', 'crowd.js', 'audio.js', 'ui.js', 'boot.js',
]

THREE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'


def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--offline', action='store_true')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    problems = dupcheck.check(SRC, MANIFEST)
    if problems:
        print('DUPCHECK FAILED:')
        for p in problems:
            print('  - ' + p)
        sys.exit(1)

    head = read(os.path.join(SRC, 'shell-head.html'))
    tail = read(os.path.join(SRC, 'shell-tail.html'))
    js_parts = []
    for f in MANIFEST:
        p = os.path.join(SRC, f)
        if not os.path.exists(p):
            print('  (skip, not built yet: %s)' % f)
            continue
        js_parts.append('// ===== %s =====' % f)
        js_parts.append(read(p).rstrip())
    iife = "(function(){\n'use strict';\n" + '\n'.join(js_parts) + '\n})();\n'

    if '<!--HB:JS-->' not in head:
        sys.exit('build: shell-head.html is missing the <!--HB:JS--> marker')
    if '<!--THREE-->' not in head:
        sys.exit('build: shell-head.html is missing the <!--THREE--> marker')

    three = ('<script src="' + THREE_CDN + '"></script>') if not args.offline else (
        '<script>\n// vendor: three.js r128 (inlined for offline use)\n'
        + read(VENDOR).rstrip() + '\n</script>')
    html = head.replace('<!--THREE-->', three)
    html = html.replace('<!--HB:JS-->', '<script>\n' + iife + '</script>')
    html += tail

    if args.offline:
        # Inline W3C namespace identifiers (createElementNS args inside three.js)
        # are NOT network references — allow-list them before the external check.
        probe = html.replace('http://www.w3.org/', '<w3-ns/>')
        for token in ('http://', 'https://', 'src="'):
            if token in probe:
                sys.exit('build: offline output still references external URL (%s)' % token)

    os.makedirs(DIST, exist_ok=True)
    name = args.out or ('hollybrook-open-offline.html' if args.offline else 'hollybrook-open.html')
    out = os.path.join(DIST, name)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    print('built %s (%.0f KiB, offline=%s)' % (out, os.path.getsize(out) / 1024.0, args.offline))


if __name__ == '__main__':
    main()
