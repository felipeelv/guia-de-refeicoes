# Guia de montagem de refeições

Consulta de porções para uma meta calórica fixa, com um cardápio por pessoa. O app roda só no navegador: não tem login nem backend; o cardápio vem dos dados locais ou do Global Config, e o diário de consumo fica no localStorage do dispositivo. A caloria da refeição não muda. O alimento muda. A porção se adapta.

As calorias existem na configuração, no cálculo e na aba Diário. Fora do Diário, a tela mostra apenas gramas e um aviso de margem, sem números de energia, para evitar o efeito psicológico de contar calorias.

Hoje existem três pessoas: Felipe (2000 kcal por dia, sem fruta, porções de 10 em 10 g), Ana Gabriela (1200 kcal por dia, porções de 5 em 5 g) e Kelly (1300 kcal por dia, porções de 5 em 5 g). O dropdown no topo troca a pessoa e mantém a refeição e os alimentos ainda válidos.

## Executar

Na raiz deste repositório:

```sh
pnpm install
pnpm dev
```

Abra [http://127.0.0.1:5174](http://127.0.0.1:5174). O servidor escuta em todas as interfaces nessa porta.

```sh
pnpm test
pnpm build
pnpm e2e
```

O build sai em `dist`.

## Publicar na Vercel

1. Crie um repositório no GitHub e envie esta pasta como raiz (não como subpasta).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Framework: Vite. Root Directory: vazio. Build: `pnpm build`. Output: `dist`.
4. Para servir o cardápio do banco (opcional), configure `VITE_GLOBAL_CONFIG_ITEMS` nas variáveis do projeto — ver abaixo. Sem ela, o app usa os dados locais de `src/catalog/`.

O `vercel.json` já redireciona as rotas do SPA (`/:pessoa/refeicoes/:mealKey`) para `index.html`. URLs antigas sem pessoa (`/refeicoes/:mealKey`) caem na pessoa padrão.

## Banco de dados (Vercel Global Config)

O cardápio (alimentos, pessoas e refeições) pode ser servido de um [Global Config](https://vercel.com/docs/global-config) na Vercel, atualizável sem redeploy. No carregamento, o app lê os itens direto do navegador; se a leitura falhar, passar de 3 s ou o conteúdo for inválido, ele usa os dados locais de `src/catalog/` — o app nunca fica fora do ar por causa do store.

### Configurar

1. Copie `.env.example` para `.env.local` e preencha `VITE_GLOBAL_CONFIG_ITEMS` com a connection string do store acrescida de `/items`, e `GLOBAL_CONFIG_ID` com o id do store (`ecfg_...`).
2. Na Vercel, adicione `VITE_GLOBAL_CONFIG_ITEMS` nas variáveis de ambiente do projeto (Settings → Environment Variables).
3. Para escrever no store, crie um token em [vercel.com/account/tokens](https://vercel.com/account/tokens) e coloque em `VERCEL_API_TOKEN` no `.env.local`. Esse arquivo nunca é commitado (`.env.*` está no `.gitignore`).

### Atualizar o cardápio

Edite `src/catalog/foods.json`, `persons.ts` ou `meals.ts` e rode:

```sh
pnpm catalog:push
```

O script valida os dados com as mesmas regras do app e grava as chaves `foods`, `persons` e `meals` no store. O plano Hobby permite 250 escritas por mês.

## Pessoas e metas

Edite `src/catalog/persons.ts`. Cada pessoa precisa de:

- `key` única, em kebab-case, usada na URL (`/felipe`, `/gabriela`);
- `name` exibido no dropdown e nos títulos;
- `dailyCalories` igual à soma das metas das refeições;
- `roundingIncrementGrams` inteiro maior que zero (10 g para metas maiores, 5 g para metas menores);
- `excludedTags` com as tags de alimento que ficam fora do cardápio dessa pessoa (hoje só `fruit`);
- `meals` com as cinco refeições e suas metas.

A primeira pessoa da lista é a padrão: `/` redireciona para ela.

A base das refeições fica em `src/catalog/meals.ts`. Cada refeição precisa de:

- `targetCalories` maior que zero;
- `carbohydrateShare` e `proteinShare` maiores que zero e somando 1 (tolerância técnica de 0,0001);
- `key` e `order` únicos.

A proporção divide a energia da refeição entre carboidrato e proteína. Ela não é meta de macronutrientes e não aparece como regra na tela. Uma configuração inválida de refeição ou de pessoa interrompe o carregamento do módulo.

## Segundo carboidrato

Cada refeição aceita um segundo carboidrato opcional, para montar combinações como arroz com feijão. Com dois carboidratos, a fatia de energia do carboidrato é dividida ao meio entre eles; a proteína não muda. O mesmo alimento não pode ocupar as duas posições e não aparece no segundo seletor.

O seletor do segundo carboidrato fica recolhido até o usuário pedir. O estado fica na URL: `/felipe/refeicoes/lunch?carb=arroz-branco&carb2=feijao-carioca&protein=peito-de-frango`.

## Diário e ajuste do cardápio

A aba Diário (`/:pessoa/diario`) registra o que foi comido no dia: refeição, alimento e quantidade (gramas, ou unidades para ovo e pão). É a única tela que mostra calorias: a soma do dia contra a meta diária, com barra de progresso e o consumo por refeição. No resultado do builder, o botão "Registrar esta refeição" lança as porções calculadas direto no diário.

Refeições com registros contam como já comidas. As demais têm a meta reescalonada na proporção do orçamento restante: `fator = (calorias diárias − consumido) ÷ soma das metas restantes`, com piso em zero. Quem comeu demais no almoço vê as porções do lanche, do jantar e da ceia encolherem em gramas; quem comeu de menos vê crescerem. O ajuste é invisível: fora do Diário, nenhum número de caloria aparece.

Os registros ficam só no dispositivo (localStorage, chave por pessoa e data, descarte após 7 dias). Não há sincronização entre aparelhos nem histórico na interface.

## Alimento contado em unidades

Alimento que se conta, e não se pesa, ganha um `unit` no `foods.json`. Hoje o ovo e o pão francês têm, os dois com 50 g por unidade e passo de meia unidade:

```json
"unit": {
  "singular": "ovo",
  "plural": "ovos",
  "gramsPerUnit": 50,
  "stepUnits": 0.5
}
```

- `gramsPerUnit`: peso da unidade média, parte comestível (ovo cozido: 50 g);
- `stepUnits`: maior que zero e no máximo 1. `0.5` fecha a porção em ovo inteiro ou meio ovo.

A tela mostra `4 ovos` ou `1 pão` em destaque e as gramas como detalhe. O alimento com unidade não usa o `roundingIncrementGrams` da pessoa: ele arredonda no múltiplo do passo (`gramsPerUnit × stepUnits`), para que a contagem exibida seja exatamente a porção calculada.

Como esse arredondamento é mais grosso, quem tem unidade fecha primeiro e cada alimento seguinte tem como alvo a energia que de fato sobrou da refeição, em vez da fatia fixa de 40/60 — inclusive quando há dois alimentos em unidade no mesmo prato, como pão com ovo. A meta da refeição continua valendo; a proporção entre carboidrato e proteína é que vira aproximada. Sem nenhum alimento com unidade no prato, o cálculo é idêntico ao de antes.

## Incluir ou atualizar um alimento

Edite `src/catalog/foods.json`. Copie o valor da ficha específica da [TBCA](https://www.tbca.net.br/), já no estado pronto para consumo. Não busque a TBCA em tempo de execução e não misture alimento cru com cozido.

Cada item precisa de:

- `id` estável, em kebab-case, sem acento;
- `name` em português;
- `meals` com as refeições em que o alimento aparece (`breakfast`, `lunch`, `snack`, `dinner`, `supper`);
- `tags` opcional, com as marcações que uma pessoa pode excluir (hoje só `fruit`);
- `preparation` com o método da ficha (por exemplo cozido ou grelhado, sem óleo);
- `unit` opcional, quando o alimento é contado em unidades e não em colheradas (ver abaixo);
- `caloriesPer100g` maior que zero;
- macronutriente desconhecido como `null`, nunca zero inventado;
- `source.name`, `source.code`, `source.url` da ficha e `source.accessedAt` em `YYYY-MM-DD`;
- `active: true` para aparecer nos seletores.

Só entram alimentos da categoria do seletor. Registro inválido fica de fora da lista e, em desenvolvimento, gera aviso no console.
