# 実装済みの機能 (現状分析 / Phase A-B 反映)

最終更新: 2025-08-18 Phase B 完了時点。コードリーディング（`main.ts`, `core/*`,
`ui/flash_card_panel.tsx`）およびテスト (`*.test.ts`) から確認できる実装状況を
整理する。粒度: SRS システムにおけるコンポーネント視点。

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

## 4. 学習セッション制御（Phase A-B 拡張）

- UI コンポーネント (`FlashCardController`):
  - Show Answer 遷移 / 1~4(Again/Hard/Good/Easy) / Enter 確定 / Esc 終了。
  - Toast による非モーダル通知 (B5)。
- メインループ: `showFlashCardController()` の ReadableStream を `for await`
  で購読。
- 回答処理: FSRS `next` を呼び `applyAnswer` で in-memory `Map` 即時更新 (A1) +
  PersistenceBuffer へ enqueue (B4)。
- 学習ステップ (B1): Learning state の短期再出題 (config `[1,10]` 分相当) を
  queue に再挿入。
- Sibling bury (B2): 同一 Note の他 Cloze は当日セッション中 bury
  され初回集中出題を回避。
- 回答時間計測 (B6): カード表示時 timestamp を保持し回答確定までの ms を review
  log 末尾列 `response_time_ms` に追記 (後方互換で 12→13 列)。
- 問題表示/解答表示は CSS 差し替え (DOM 再構築最小化)。

## 5. CSS/表示の最小制御

- Cloze 非表示は line id セレクタ列挙による CSS `visibility:hidden`。
- 回答表示では穴埋め部のみ再表示。

## 6. エラーハンドリング / 通知 (改善)

- 旧: `alert()` ベース。
- 現行: Toast コンポーネント (info / error) に置換 (B5)。
  - 失敗時リトライ導線は今後拡張予定 (現状は表示のみ)。

## 7. ユーティリティ / 実装クオリティ

- ストレージ更新は AST 的パース（Scrapbox ブロック） → 差し替え →
  patch。既存表を一部書き換え・末尾追加のロジックが実装済。
- 重複行排除（`cardStream` 内で `yielded` セット）。
- 型安全: `option-t` Result を利用したエラー分岐。

## 8. テスト

- Phase A でセッション/キュー/サマリー/ストレージ周辺ユニットテストを拡充。
- Phase B 追加: learning steps, sibling bury, persistence buffer (バッチ条件),
  review log 後方互換 (12/13列) / response time 列のパーステスト。

## 9. 技術選定

- FSRS 実装ライブラリ: `ts-fsrs`（パラメータはデフォルト）。
- UI: Preact + Shadow DOM 埋め込み。（副作用的 mount / unmount）
- 設計層構造: 概要は [architecture.md](./architecture.md) 参照。

## 10. 現状で“できている”と判断する MVP+ 範囲 (Phase B 終了時)

- ページから Cloze 抽出 → カード初期化 → 三分割キュー (New/Learning/Review) 出題
  → 学習ステップ再出題 → Sibling bury → セッション内 HUD 進捗表示 → 回答サマリー
  (正答率/新規投入/失敗数) → バッチ persistence (10件 or 30s) → review log
  へ応答時間含む記録。

## 11. まだ不十分だが基盤は存在する領域（更新後ギャップ）

| 項目                           | 現在 (Phase B)                           | 残ギャップ / 追加要件                                 |
| ------------------------------ | ---------------------------------------- | ----------------------------------------------------- |
| インターバル再スケジュール     | FSRS + Learning steps 再挿入実装済       | Backlog / fuzz / 負荷平準化ロジック未導入             |
| 状態反映                       | In-memory 即時更新 (A1)                  | 競合時ロールバック / オフライン編集差分マージ         |
| セッション統計 / サマリー      | HUD + 正答率/新規/失敗数サマリー (A4,B3) | 応答時間統計 / Stability 変化Δ / Retention 推定       |
| エラーハンドリング             | Toast 表示 (B5)                          | 分類 / 自動リトライ / 詳細ログ収集 / オフラインキュー |
| 同期戦略                       | バッチ (10件 or 30s) (B4)                | 競合検出 / 冪等リトライ / オフライン隊列 / 圧縮       |
| パラメータチューニング         | デフォルト固定                           | 個別 MLE 推定 / Retention 目標制御                    |
| Sibling (同一 Note Cloze) 制御 | bury 当日抑止 (B2)                       | bury 戦略の設定化 / 週跨ぎデッキ回避オプション        |
| Backlog 処理                   | 未実装                                   | 過負荷緩和導入 (Phase C 予定)                         |
| Quality Gate                   | 単体+スナップショット拡充                | CI coverage Gate / property-based fuzz / 負荷テスト   |
| 応答時間活用                   | ログ保存のみ (B6)                        | 難易度補正 / 集計可視化 / 異常遅延検知                |

---

追加の詳細・未解決設計課題は [srs_design_gaps.md](./srs_design_gaps.md),
理論/アルゴリズムは [learning_theory.md](./learning_theory.md),
[scheduling_strategy.md](./scheduling_strategy.md), モデル/ストレージは
[data_model_and_storage.md](./data_model_and_storage.md), メトリクスは
[metrics_and_evaluation.md](./metrics_and_evaluation.md), 用語は
[glossary.md](./glossary.md) を参照。
