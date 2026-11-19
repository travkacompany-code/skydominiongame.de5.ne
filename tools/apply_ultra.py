# Вшивает дизайн «ПЛАНШЕТ» (шрифты + 110_ultra_design.css) в готовый dist/game.html -> dist/game_ultra.html
import re,os
os.chdir(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
s=open('dist/game.html',encoding='utf-8').read()
s=re.sub(r'<link href="https://fonts\.googleapis\.com/css2\?family=Exo\+2[^"]*" rel="stylesheet">\n?','',s)
add='<style id="bv-ultra-design">\n'+open('src/css/109_fonts.css',encoding='utf-8').read()+open('src/css/110_ultra_design.css',encoding='utf-8').read()+'\n</style>\n'
i=s.find('</style>',s.rfind('</style>',0,s.find('</head>')))+len('</style>')
open('dist/game_ultra.html','w',encoding='utf-8').write(s[:i]+'\n'+add+s[i:]);print('ok')
