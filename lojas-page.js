// Página para subir a "base comercial" do varejo (venda das lojas por dia, loja e referência).
const esc = (s) => String(s ?? '—').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function lojasPage(st) {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Importar venda das lojas</title>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
 body{font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:40px auto;padding:0 20px;color:#1f1f1f;line-height:1.45}
 h1{font-size:22px;margin:0 0 6px} p{color:#555;margin:0 0 18px}
 .box{border:1.5px dashed #b9b2a6;border-radius:12px;padding:28px;text-align:center;background:#faf8f4}
 button{margin-top:14px;padding:11px 20px;border:0;border-radius:8px;background:#1f1f1f;color:#fff;font-size:15px}
 button:disabled{opacity:.4}
 #msg{margin-top:18px;white-space:pre-line} .ok{color:#21733d} .erro{color:#b3261e}
 dl{display:grid;grid-template-columns:auto 1fr;gap:4px 14px;font-size:14px;color:#555;margin-top:28px}
 dt{color:#888}
</style></head><body>
<h1>Importar venda das lojas</h1>
<p>Suba a <b>base comercial</b> do varejo (Excel com Data (dia), Código da loja, Loja, Referência, Valor de venda, Peças, Valor de tabela). Cada importação substitui os dias que o arquivo contém: pode mandar o mês inteiro todo dia.</p>
<div class="box">
 <input type="file" id="f" accept=".xlsx,.xls,.csv">
 <br><button id="b" disabled>Importar</button>
</div>
<div id="msg"></div>
<dl>
 <dt>Último arquivo</dt><dd>${esc(st.lojas_arquivo)}</dd>
 <dt>Importado em</dt><dd>${esc(st.lojas_importado_em)}</dd>
 <dt>Dias importados</dt><dd>${esc(st.lojas_dias)} (até ${esc(st.lojas_ultimo_dia)})</dd>
</dl>
<script>
const f=document.getElementById('f'),b=document.getElementById('b'),m=document.getElementById('msg');
f.onchange=()=>{b.disabled=!f.files.length;m.textContent='';};
b.onclick=async()=>{
  b.disabled=true;m.className='';m.textContent='Lendo o arquivo…';
  try{
    const arq=f.files[0];
    const wb=XLSX.read(await arq.arrayBuffer(),{dense:true,cellDates:false});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:true,defval:null});
    let h=rows.findIndex((r)=>(r||[]).some((c)=>/refer/i.test(String(c??'')))&&(r||[]).some((c)=>/valor de venda/i.test(String(c??''))));
    if(h<0)throw new Error('Não achei o cabeçalho (Referência, Valor de venda…).');
    const colunas=rows[h].map((c)=>String(c??'').trim());
    const linhas=rows.slice(h+1).filter((r)=>r&&r.some((c)=>c!=null&&c!==''));
    m.textContent='Enviando '+linhas.length.toLocaleString('pt-BR')+' linhas…';
    const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({nome_arquivo:arq.name,colunas,linhas})});
    const j=await r.json();
    if(!j.ok)throw new Error(j.erro||'Falhou');
    m.className='ok';
    const br=(d)=>d.slice(8,10)+'/'+d.slice(5,7);
    m.textContent='Importado: '+j.linhas.toLocaleString('pt-BR')+' linhas, '+j.lojas+' lojas, de '+br(j.de)+' a '+br(j.ate)+'.'+(j.venda_sem_custo?'\\nVenda de referências sem custo GEC: R$ '+Math.round(j.venda_sem_custo).toLocaleString('pt-BR')+' (a margem delas segue a média do dia).':'')+'\\nAtualize o painel para ver na aba Plano BF.';
  }catch(e){m.className='erro';m.textContent='Erro: '+e.message;}
  b.disabled=false;
};
</script>
</body></html>`;
}
