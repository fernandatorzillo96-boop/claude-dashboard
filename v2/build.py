# Gera v2/index.html a partir do index.html atual: reaproveita todas as seções (mesmos IDs e fontes de dados)
# dentro da nova estrutura (v2/shell.html). Rodar de novo sempre que o index.html mudar.
import re, pathlib
raiz = pathlib.Path(__file__).resolve().parent.parent
s = (raiz / 'index.html').read_text()
shell = (raiz / 'v2' / 'shell.html').read_text()
ordem = ['curva', 'planobf', 'plano', 'promos', 'margem', 'colecoes', 'estoque', 'match', 'faturado', 'logistica', 'atendimento', 'midia']
secs = {m.group(2): m.group(1) for m in re.finditer(r'(<section class="bf-page" data-page="([a-z0-9]+)"[\s\S]*?</section>)', s)}
faltam = set(secs) - set(ordem)
assert not faltam, f'seções sem lugar na v2: {faltam}'
html = []
for k in ordem:
    sec = secs[k]
    if ' hidden>' not in sec.split('\n', 1)[0]:
        sec = sec.replace(f'id="{k}">', f'id="{k}" hidden>', 1)
    html.append(sec)
strip = re.search(r'<div class="bf-strip" id="mes">[\s\S]*?\n    </div>\n', s).group(0)
out = shell.replace('@@STRIP@@', strip).replace('@@SECTIONS@@', '\n\n    '.join(html))
(raiz / 'v2' / 'index.html').write_text(out)
ids_v1 = set(re.findall(r'id="([^"]+)"', s)); ids_v2 = set(re.findall(r'id="([^"]+)"', out))
print('ids do painel atual ausentes na v2:', sorted(ids_v1 - ids_v2))
print('fontes de dados v1 sem uso na v2:', sorted(set(re.findall(r'data-source="([^"]+)"', s)) - set(re.findall(r'data-source="([^"]+)"', out))))
