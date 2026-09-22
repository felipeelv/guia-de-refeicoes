# Guia de montagem de refeições

Consulta de porções para uma meta calórica fixa, com um cardápio por pessoa. O app roda só no navegador: não tem login, banco nem soma do dia. A caloria da refeição não muda. O alimento muda. A porção se adapta.

Hoje existem duas pessoas: Felipe (2000 kcal por dia, sem fruta, porções de 10 em 10 g) e Ana Gabriela (1200 kcal por dia, porções de 5 em 5 g). O dropdown no topo troca a pessoa e mantém a refeição e os alimentos ainda válidos.

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
4. Não é necessário configurar variável de ambiente.

O `vercel.json` já redireciona as rotas do SPA (`/:pessoa/refeicoes/:mealKey`) para `index.html`. URLs antigas sem pessoa (`/refeicoes/:mealKey`) caem na pessoa padrão.

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

## Incluir ou atualizar um alimento

Edite `src/catalog/foods.json`. Copie o valor da ficha específica da [TBCA](https://www.tbca.net.br/), já no estado pronto para consumo. Não busque a TBCA em tempo de execução e não misture alimento cru com cozido.

Cada item precisa de:

- `id` estável, em kebab-case, sem acento;
- `name` em português;
- `meals` com as refeições em que o alimento aparece (`breakfast`, `lunch`, `snack`, `dinner`, `supper`);
- `tags` opcional, com as marcações que uma pessoa pode excluir (hoje só `fruit`);
- `preparation` com o método da ficha (por exemplo cozido ou grelhado, sem óleo);
- `caloriesPer100g` maior que zero;
- macronutriente desconhecido como `null`, nunca zero inventado;
- `source.name`, `source.code`, `source.url` da ficha e `source.accessedAt` em `YYYY-MM-DD`;
- `active: true` para aparecer nos seletores.

Só entram alimentos da categoria do seletor. Registro inválido fica de fora da lista e, em desenvolvimento, gera aviso no console.
