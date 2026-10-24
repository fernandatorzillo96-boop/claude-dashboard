# VTEX BF26: conector do painel de Black Friday

Este servidor lê a VTEX da Água de Coco (**só leitura**) e entrega ao Claude os números do painel de Black Friday:

- captado por hora e por dia
- resultado por promoção e cupom
- margem bruta com Custo GEC
- estoque total e produtos ativos
- faturado líquido de devolução, a partir do relatório 3351 que você importa

Ele não altera nada na VTEX: o código só faz consultas (GET), e a chave pedida é só de leitura.

## O que ele faz sozinho

| A cada | O quê |
|---|---|
| 5 min | Busca os pedidos novos das últimas 48 h (lista e detalhe com itens e promoções) |
| 1 h | Revisa o status de todos os pedidos desde `BF_INICIO` para pegar cancelamentos |
| 3 h | Soma o estoque de todos os SKUs, em todos os warehouses (lojas e CD) |
| 24 h | Relê o catálogo: SKUs e produtos ativos, referência de cada SKU |

Regras de cálculo, as mesmas do plano BF26:

- **Captado**: soma dos itens dos pedidos, exceto os cancelados, em todos os canais. Pedidos são contados sem sufixo (-01, -02).
- **CMV**: peças × Custo GEC da referência. A tabela vem de `CONTROLE | CUSTO GEC` do Planejamento BF. O SKU é ligado à referência pelo código reduzido; sem esse vínculo, o servidor usa a referência do produto no catálogo VTEX. Se mesmo assim não houver custo, o CMV é estimado em 13,43% do preço DE e o painel mostra a cobertura exata.
- **Desconto médio**: 1 − captado ÷ (peças × preço DE).
- **Faturado líquido**: vendido − devolvido do 3351, por data de emissão, com CMV por Custo GEC.
- Frete grátis fica fora do ranking de promoções (`PROMO_IGNORAR`).

## Publicar no Render (uns 20 minutos)

### 1. Chave da VTEX só de leitura

No Admin da VTEX, vá em **Configurações da conta → Perfis de acesso** e crie um perfil "Painel BF (leitura)" com:

- **OMS - Read only** (listar e ver pedidos)
- **Logistics - Read only** (estoque)
- o recurso **View Product** (Catalog), para SKUs e produtos

Depois, em **Chaves de API**, gere uma chave e associe a ela só esse perfil. Guarde a App Key e o App Token.

### 2. Subir o código no GitHub

1. No GitHub: **New repository** → nome `vtex-bf26` → **Private** → Create.
2. Na página do repositório vazio: **uploading an existing file**. Selecione **todos os arquivos** desta pasta e arraste juntos (não há subpastas).
3. **Commit changes**.

### 3. Criar o serviço no Render

1. No Render: **New → Blueprint** → conecte o GitHub e escolha o repositório `vtex-bf26`.
2. O Render lê o `render.yaml` e pede dois valores. Cole:
   - `VTEX_APP_KEY`: a App Key
   - `VTEX_APP_TOKEN`: o App Token
3. **Apply**. O plano é o Starter (US$ 7/mês) com 1 GB de disco (US$ 0,25/mês). O disco guarda o cache, então o servidor não precisa baixar tudo de novo quando reinicia.
4. Quando o deploy terminar, abra o serviço → **Logs**. Vão aparecer duas linhas:
   ```
   URL do conector (cole no Claude): https://vtex-bf26-xxxx.onrender.com/mcp/AbC123...
   Página para importar o 3351: https://vtex-bf26-xxxx.onrender.com/importar/AbC123...
   ```
   Essas URLs são a senha do painel: quem tiver uma delas lê os números de venda. Não compartilhe fora do time.

A primeira sincronização baixa todos os pedidos desde `BF_INICIO` (01/10) e leva alguns minutos. A primeira varredura de estoque também.

### 4. Adicionar no Claude

**Configurações → Conectores → Adicionar conector personalizado**:

- Nome: `VTEX BF26`
- URL: a URL do conector (a primeira linha do log)

Para o time: cada pessoa adiciona o mesmo conector na conta dela, com a mesma URL.

### 5. Todo dia de manhã: importar o 3351

Abra a **página de importação** (a segunda URL do log; pode salvar nos favoritos do celular), escolha o .XLS do 3351 e toque em **Importar**. Cada importação substitui os dias que o arquivo contém, então pode mandar o mês inteiro todo dia. As vendas do 3351 também ensinam ao servidor a referência de SKUs novos, e isso melhora a cobertura do CMV.

## Variáveis (Render → Environment)

| Variável | Padrão | Para quê |
|---|---|---|
| `VTEX_ACCOUNT` | `lojaaguadecoco` | Nome da conta VTEX (o que vem antes de `.myvtex.com`) |
| `VTEX_APP_KEY` / `VTEX_APP_TOKEN` | (obrigatório) | Chave só de leitura |
| `ACCESS_SECRET` | gerado pelo Render | Código da URL. Trocar o valor invalida as URLs antigas |
| `BF_INICIO` | `2026-10-01` | Primeiro dia acompanhado |
| `SYNC_EVERY_MIN` | `5` | Intervalo de busca de pedidos |
| `ESTOQUE_EVERY_MIN` | `180` | Intervalo da varredura de estoque |
| `PROMO_IGNORAR` | `frete gr` | Promoções fora do ranking (expressão regular) |
| `CUSTO_SOBRE_DE_ESTIMADO` | `0.1343` | CMV estimado quando o SKU não tem Custo GEC |

## Ferramentas que o Claude vê

`bf_vendas_por_hora`, `bf_vendas_por_dia`, `bf_resultado_promocoes`, `bf_estoque_por_warehouse`, `bf_resumo_catalogo`, `bf_faturado_liquido` e `bf_status`. Todas são só leitura. As de período aceitam `inicio` e `fim` (AAAA-MM-DD, horário de Brasília).

## Se algo der errado

- **`bf_status` mostra "VTEX 401/403"**: falta permissão na chave (passo 1).
- **Logs dizem "Defina VTEX_APP_KEY"**: a variável está vazia no Render.
- **Estoque vazio logo depois do deploy**: a primeira varredura ainda está rodando. `bf_resumo_catalogo` mostra o progresso.
