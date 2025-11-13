/**
 * TESTE ESPECÍFICO PARA PYCHARM
 *
 * Este arquivo está dentro de src/ então DEVE ser validado pelo PyCharm
 *
 * INSTRUÇÕES:
 * 1. Abra este arquivo no PyCharm
 * 2. Veja se aparecem sublinhados vermelhos nos erros abaixo
 * 3. Se não aparecer, siga o guia PYCHARM-SETUP.md
 */

import { Model, Manager, CharField, IntegerField, DateTimeField, BooleanField } from './core';

class TestBook extends Model {
  declare id?: number;
  declare title: string;
  declare pages: number;
  declare publishedDate: Date;
  declare isAvailable: boolean;

  static objects: Manager<TestBook>;
}

TestBook.init({
  title: new CharField({ maxLength: 200 }),
  pages: new IntegerField(),
  publishedDate: new DateTimeField(),
  isAvailable: new BooleanField(),
});

// =============================================================================
// COLOQUE O CURSOR EM CADA LINHA ABAIXO E VEJA SE O PYCHARM MOSTRA ERRO
// =============================================================================

// ❌ ERRO 1: Campo não existe (deve ter sublinhado vermelho)
TestBook.objects.filter({
  campoInvalido: 'teste',
});

// ❌ ERRO 2: Lookup não existe para number (deve ter sublinhado vermelho)
TestBook.objects.filter({
  pages__contains: 'texto',
});

// ❌ ERRO 3: Tipo errado - string ao invés de number (deve ter sublinhado vermelho)
TestBook.objects.filter({
  pages__gt: '100',
});

// ❌ ERRO 4: Tipo errado - string[] ao invés de number[] (deve ter sublinhado vermelho)
TestBook.objects.filter({
  pages__in: ['100', '200'],
});

// ❌ ERRO 5: Tipo errado - boolean ao invés de string[] (deve ter sublinhado vermelho)
TestBook.objects.filter({
  title__in: true,
});

// =============================================================================
// SE OS ERROS ACIMA NÃO APARECEM NO PYCHARM:
// =============================================================================
//
// 1. Clique com botão direito no projeto → "Mark Directory as" → "Sources Root"
// 2. File → Invalidate Caches → Invalidate and Restart
// 3. Settings → Languages & Frameworks → TypeScript:
//    - TypeScript version: Use workspace version (./node_modules/typescript)
//    - Check: "Recompile on changes"
//    - Check: "Use tsconfig.json"
// 4. Verifique se aparece a mensagem "TypeScript X.X.X Service" no rodapé
// 5. Consulte PYCHARM-SETUP.md para mais detalhes
//
// =============================================================================

export {};
