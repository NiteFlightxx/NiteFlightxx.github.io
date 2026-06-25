#!/usr/bin/env python3
"""Convert single-line $$...$$ display formulas to fenced style.

remark-math only parses $$ as block (display) math when the closing $$ is on
its own line. Single-line $$...$$ is parsed as inline math, which renders
left-aligned without display style. This script rewrites:

    $$<formula>$$

into:

    $$
    <formula>
    $$

Only lines that start AND end with $$ (with content between) are touched.
"""
import sys

def is_single_line_display(s):
    return s.startswith('$$') and s.endswith('$$') and len(s) > 4

def main():
    path = sys.argv[1]
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    out = []
    converted = 0
    for ln in lines:
        s = ln.rstrip('\n')
        if is_single_line_display(s):
            inner = s[2:-2]
            out.append('$$\n')
            out.append(inner + '\n')
            out.append('$$\n')
            converted += 1
        else:
            out.append(ln)
    with open(path, 'w', encoding='utf-8') as f:
        f.writelines(out)
    print(f'Converted {converted} single-line display formulas to fenced style')

if __name__ == '__main__':
    main()
