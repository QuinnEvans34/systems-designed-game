"""Build the game's original 5x7 pixel font (optional authoring dependency: fonttools)."""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen

# Each row is a five-bit mask. Lowercase uses the same arcade letterforms.
patterns = {
    'A': [14,17,17,31,17,17,17], 'B': [30,17,17,30,17,17,30],
    'C': [14,17,16,16,16,17,14], 'D': [30,17,17,17,17,17,30],
    'E': [31,16,16,30,16,16,31], 'F': [31,16,16,30,16,16,16],
    'G': [14,17,16,23,17,17,15], 'H': [17,17,17,31,17,17,17],
    'I': [14,4,4,4,4,4,14], 'J': [7,2,2,2,18,18,12],
    'K': [17,18,20,24,20,18,17], 'L': [16,16,16,16,16,16,31],
    'M': [17,27,21,21,17,17,17], 'N': [17,25,21,19,17,17,17],
    'O': [14,17,17,17,17,17,14], 'P': [30,17,17,30,16,16,16],
    'Q': [14,17,17,17,21,18,13], 'R': [30,17,17,30,20,18,17],
    'S': [15,16,16,14,1,1,30], 'T': [31,4,4,4,4,4,4],
    'U': [17,17,17,17,17,17,14], 'V': [17,17,17,17,17,10,4],
    'W': [17,17,17,21,21,21,10], 'X': [17,17,10,4,10,17,17],
    'Y': [17,17,10,4,4,4,4], 'Z': [31,1,2,4,8,16,31],
    '0': [14,17,19,21,25,17,14], '1': [4,12,4,4,4,4,14],
    '2': [14,17,1,2,4,8,31], '3': [30,1,1,14,1,1,30],
    '4': [2,6,10,18,31,2,2], '5': [31,16,16,30,1,1,30],
    '6': [14,16,16,30,17,17,14], '7': [31,1,2,4,8,8,8],
    '8': [14,17,17,14,17,17,14], '9': [14,17,17,15,1,1,14],
    ' ': [], '.': [0,0,0,0,0,12,12], ',': [0,0,0,0,12,12,8],
    ':': [0,12,12,0,12,12,0], ';': [0,12,12,0,12,12,8],
    '!': [4,4,4,4,4,0,4], '?': [14,17,1,2,4,0,4],
    "'": [4,4,8,0,0,0,0], '"': [10,10,20,0,0,0,0],
    '-': [0,0,0,31,0,0,0], '_': [0,0,0,0,0,0,31],
    '/': [1,2,2,4,8,8,16], '\\': [16,8,8,4,2,2,1],
    '(': [2,4,8,8,8,4,2], ')': [8,4,2,2,2,4,8],
    '[': [14,8,8,8,8,8,14], ']': [14,2,2,2,2,2,14],
    '{': [3,4,4,8,4,4,3], '}': [24,4,4,2,4,4,24],
    '+': [0,4,4,31,4,4,0], '=': [0,0,31,0,31,0,0],
    '<': [1,2,4,8,4,2,1], '>': [16,8,4,2,4,8,16],
    '*': [0,21,14,31,14,21,0], '#': [10,10,31,10,31,10,10],
    '%': [25,25,2,4,8,19,19], '&': [12,18,20,8,21,18,13],
    '@': [14,17,23,21,23,16,14], '$': [4,15,20,14,5,30,4],
    '^': [4,10,17,0,0,0,0], '`': [8,4,0,0,0,0,0],
    '|': [4,4,4,4,4,4,4], '~': [0,0,9,22,0,0,0],
    '×': [0,17,10,4,10,17,0], '·': [0,0,0,4,0,0,0],
    '…': [0,0,0,0,0,0,21], '★': [4,4,31,14,14,27,17],
    '●': [0,14,31,31,31,14,0], '○': [0,14,17,17,17,14,0],
    '←': [0,4,8,31,8,4,0], '→': [0,4,2,31,2,4,0],
    '↑': [4,14,21,4,4,4,0], '↓': [0,4,4,4,21,14,4],
    '↩': [0,0,8,17,31,16,8], '↻': [14,17,1,7,1,17,14],
    '↗': [0,15,3,5,9,16,0], '✓': [0,0,1,2,20,8,0],
    '☰': [31,31,0,31,0,31,31], '⚠': [4,14,14,27,27,31,31],
}
for letter in 'abcdefghijklmnopqrstuvwxyz':
    patterns[letter] = patterns[letter.upper()]
for char in '’‘':
    patterns[char] = patterns["'"]
for char in '“”':
    patterns[char] = patterns['"']
for char in '–—':
    patterns[char] = patterns['-']

fb = FontBuilder(1000, isTTF=True)
names = {ord(c): 'uni%04X' % ord(c) for c in patterns}
fb.setupGlyphOrder(['.notdef'] + list(names.values()))
fb.setupCharacterMap(names)
glyphs, metrics = {}, {}
for char, rows in [('.notdef', patterns['?'])] + list(patterns.items()):
    name = '.notdef' if char == '.notdef' else names[ord(char)]
    pen = TTGlyphPen(None)
    for row, mask in enumerate(rows):
        for col in range(5):
            if mask & (1 << (4-col)):
                x, y = col*100, (6-row)*100
                pen.moveTo((x,y)); pen.lineTo((x,y+100))
                pen.lineTo((x+100,y+100)); pen.lineTo((x+100,y)); pen.closePath()
    glyphs[name], metrics[name] = pen.glyph(), (600, 0)
fb.setupGlyf(glyphs)
fb.setupHorizontalMetrics(metrics)
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'Wayfarer Pixel', 'styleName': 'Regular',
                   'uniqueFontIdentifier': 'WayfarerPixel-Regular-1',
                   'fullName': 'Wayfarer Pixel', 'psName': 'WayfarerPixel-Regular',
                   'version': 'Version 1.0'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.setupMaxp()
target = Path(__file__).resolve().parents[1] / 'assets/ui/wayfarer-pixel.ttf'
fb.save(target)
print(target)
