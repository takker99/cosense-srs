# 実装済みの機能 (現状分析)

コードリーディング（`main.ts`, `core/*`,
`ui/flash_card_panel.tsx`）に基づき、現在確認できる完成度を整理する。粒度:
SRSシステムにおけるコンポーネント視点。

## 1. 入力（ノート抽出）

- Cosense ページ API からページ行リストを取得 (`getPage`).
- `parseNotes` により:
  - GUID 明示指定行の検出
  - 指定装飾記号（デフォルト `!`）+ アスタリスク列で Cloze 番号を抽出
  - Line 範囲を `Set<lineId>` で保持しスクロール制御に利用
- 重複 GUID の扱いは未確定（現状: 後勝ちではなく重複混在を許してしまう）→
  未解決仕様として別文書に指摘済。

## 2. カード状態ロード

- ページ内で生成し得る `CardId` を列挙し、ストレージ（ユーザ別 table:
  `${username}-card`）から CSV 的フォーマットをストリームで読み取り
  (`readCards` + `cardStream`).
- 見つからないカードは `createEmptyCard()` で初期化。
- メモリ保持は `Map<CardId, CosenseCard>`。

## 3. レビューログ読み書き基盤

- `writeReviewLog` がユーザ別 table (`${username}-revlog`) に追記形式で patch。
- `RevLog` モデルは FSRS の `ReviewLog` + (noteId, ord)。

## 4. 学習セッション制御（最小機能）

- UI コンポーネント (`FlashCardController`) が:
  - Show Answer 遷移
  - Easy / Good / Hard / Again 評価（Enter → 1~4 数字による入力）
  - Escape で終了
- メインループは `showFlashCardController()` の ReadableStream を `for await`
  で購読。
- 回答後: FSRS `next` を呼び card 更新結果 + log を個別書き込み。
- 問題表示/解答表示は CSS 差し替えで行う（DOM
  コンテンツ自体は再レンダリングしない）。

## 5. CSS/表示の最小制御

- Cloze 非表示は line id セレクタ列挙による CSS `visibility:hidden`。
- 回答表示では穴埋め部のみ再表示。

## 6. 基盤的エラーハンドリング

- セッションループ内 `try/catch` → `alert()` で通知。致命的例外の場合のみ再
  throw。

## 7. ユーティリティ / 実装クオリティ

- ストレージ更新は AST 的パース（Scrapbox ブロック） → 差し替え →
  patch。既存表を一部書き換え・末尾追加のロジックが実装済。
- 重複行排除（`cardStream` 内で `yielded` セット）。
- 型安全: `option-t` Result を利用したエラー分岐。

## 8. テスト

- `core` 配下に一部ユニットテスト（storage 更新や note
  パース）が存在（スナップショット含む）。

## 9. 技術選定

- FSRS 実装ライブラリ: `ts-fsrs`（パラメータはデフォルト）。
- UI: Preact + Shadow DOM 埋め込み。（副作用的 mount / unmount）
- 設計層構造: 概要は [architecture.md](./architecture.md) 参照。

## 10. 現状で“できている”と判断する最小 MVP 範囲

- ページから Cloze 抽出 → 新規カード初期化 → シャッフル出題 →
  単発セッションの記録（card + revlog 永続化）。

## 11. まだ不十分だが基盤は存在する領域（ギャップ例）

| 項目                           | 既存                  | 必要な完成形へのギャップ                                    |
| ------------------------------ | --------------------- | ----------------------------------------------------------- |
| インターバル再スケジュール     | FSRS `next` 呼び出し  | 学習中 queue 再挿入／次 due 優先順制御未実装                |
| 状態反映                       | DB に即書込           | メモリ上の `cardsInThePage` 未更新 / セッション内挙動非適応 |
| セッション統計                 | 初回 alert で枚数表示 | 進捗リアルタイム更新 / 結果サマリーなし                     |
| エラーハンドリング             | alert                 | 型別 UI / 再試行 / ログ収集なし                             |
| 同期戦略                       | 即時単発 patch        | まとめ書き・衝突回避・オフライン考慮なし                    |
| パラメータチューニング         | デフォルト固定        | 個人学習履歴からの推定機構なし                              |
| Sibling (同一 Note Cloze) 制御 | なし                  | 連続出題回避 (bury siblings)                                |
| Backlog 処理                   | なし                  | 期限超過カードの段階的放出 (load balancing)                 |
| Quality Gate                   | 一部ユニットテスト    | カバレッジ / CI / プロパティテスト不足                      |

---

追加の詳細・未解決設計課題は [srs_design_gaps.md](./srs_design_gaps.md),
理論/アルゴリズムは [learning_theory.md](./learning_theory.md),
[scheduling_strategy.md](./scheduling_strategy.md), モデル/ストレージは
[data_model_and_storage.md](./data_model_and_storage.md), メトリクスは
[metrics_and_evaluation.md](./metrics_and_evaluation.md), 用語は
[glossary.md](./glossary.md) を参照。
