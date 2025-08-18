# データモデル & ストレージ設計

## 1. エンティティ

| Entity            | 主フィールド                                                                                                       | 説明                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Note              | id, range(lineIds), created, updated, clozeDeletions(Set<number>)                                                  | ページ内構造から抽出される学習単位 |
| Card              | (Note.id + ord) => CardId, FSRS 状態フィールド                                                                     | Cloze ごとの記憶トラッカー         |
| ReviewLog         | rating, state, due, stability, difficulty, elapsed_days, last_elapsed_days, scheduled_days, learning_steps, review | FSRS 遷移ログ                      |
| UserConfig (予定) | targetRetention, dailyNewLimit, learningSteps など                                                                 | 適応学習パラメータ                 |

## 2. Card モデル (ts-fsrs)

| フィールド     | 意味                           | 備考               |
| -------------- | ------------------------------ | ------------------ |
| state          | New/Learning/Relearning/Review | 列挙値 (number)    |
| due            | 次回出題日時                   | Date 精度          |
| stability      | 長期保持力                     | 日数スケール近似   |
| difficulty     | 主観的難度 (低いほど易しい)    | 漂流監視対象       |
| elapsed_days   | 前回レビューからの実経過日     | 回答時更新         |
| scheduled_days | 予定間隔                       | FSRS 計算結果      |
| learning_steps | 学習ステップ残                 | 0 到達で長期間隔へ |
| reps           | 総レビュー回数                 | メトリクス集計     |
| lapses         | 失敗 (Again) 回数              | Leech 判定         |
| last_review    | 前回 review 時刻               | null 許容          |

## 3. Storage 物理構造

| Table名              | 由来     | 形式                          | 主キー             |
| -------------------- | -------- | ----------------------------- | ------------------ |
| `${username}-card`   | ユーザ別 | Scrapbox table ブロック (TSV) | (noteId, ord) 擬似 |
| `${username}-revlog` | ユーザ別 | 同上                          | 時系列 append      |

### 行例 (card)

```
noteId	ord	state	due	stability	difficulty	elapsed_days	scheduled_days	learning_steps	reps	lapses	last_review
noteA	1	3	1734450000000	12.5	4.2	5	10	0	23	2	1733845200000
```

## 4. 正規化 vs 単一テーブル

- 現状: カード・ログともにテーブル単体で完結。Note
  メタは再生成可能なため冗長保持不要。
- 拡張案: Note メタ (GUID, tag, 初回作成日) を別 table
  化して高速フィルタリング向上。

## 5. 冪等性と競合

| シナリオ               | 課題                  | 対策                                                  |
| ---------------------- | --------------------- | ----------------------------------------------------- |
| 同時セッション二重更新 | 最後の patch が上書き | 行ハッシュ比較 + 差分マージ / 警告                    |
| ネットワーク断続       | 一部書込失敗          | ローカルキューと再試行 ID (cardId + last_review) 去重 |

## 6. インデックス的最適化

- 未来 due フィルタ高速化: メモリ Map を一次ソース → 必要に応じて小規模 sorted
  array キャッシュ。
- 大規模化時 (>= 50k カード) は due ヒープ (priority queue) 導入で `O(log n)`
  pop。

## 7. ガーベジ・圧縮

| 対象           | 条件                            | 処理                           |
| -------------- | ------------------------------- | ------------------------------ |
| ReviewLog      | 期間 > 180日 & stability > 閾値 | 集約 (初回/最新/統計) 行へ縮約 |
| Suspended Card | 1年非復帰                       | アーカイブ table に移動        |

## 8. エクスポート / インポート

- JSON / TSV / (将来) Anki パッケージ互換 (必要項目だけ)。
- 署名 (hash) を付与し改変検知。

## 9. GUID 一意性ポリシー案

| 案                        | 利点   | 欠点               |
| ------------------------- | ------ | ------------------ |
| ページ内重複禁止 (strict) | 一貫性 | 衝突時編集手順要求 |
| project+title スコープ    | 柔軟   | 移動時重複リスク   |
| 全ページ global (UUID)    | 汎用   | 可読性喪失         |

初期: ページ内 uniqueness を enforce (最小実装容易)。

## 10. バージョン管理

- メタ行: `# card-schema-version:1` を table 直前コメントとして埋め込み;
  変更時マイグレーション手続定義。

## 11. Local Cache (将来)

| レイヤ | 技術                | 目的               |
| ------ | ------------------- | ------------------ |
| 短期   | Map (in-memory)     | セッション速度     |
| 中期   | IndexedDB           | オフライン support |
| 永続   | Remote patch tables | 共有/同期          |

---

評価メトリクスは [metrics_and_evaluation.md](./metrics_and_evaluation.md)
を参照。
