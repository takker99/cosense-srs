# アーキテクチャ概要

本プロジェクトの論理コンポーネントと責務を整理し、拡張時の分離境界を明確化する。

## 1. コンポーネント層

| 層                   | 役割                                   | 主ファイル/例                                         | 境界ルール                                                   |
| -------------------- | -------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Presentation(UI)     | 学習操作入力と状態表示                 | `ui/flash_card_panel.tsx`                             | ドメインロジック直接保持しない (コールバック / イベント経由) |
| Application(Service) | セッション制御フロー                   | 予定: `core/session/` _(未作成)_ / 現状 `startReview` | UI へ副作用通知・ストレージへ永続要求                        |
| Domain(Model)        | Note/Card/ReviewLog 変換とアルゴリズム | `core/note.ts`, `core/card.ts`                        | 外部I/Oに依存しない純粋ロジック重視                          |
| Infrastructure       | Cosense API, patch, parser             | `core/card_storage.ts`, `core/review_log_storage.ts`  | エラー型を Result 化し上位へ返却                             |
| Knowledge Docs       | 設計/研究基盤                          | `knowledge/*.md`                                      | コードからは参照しない                                       |

## 2. セッションライフサイクル (将来像)

```
Session.start(project,title)
  └ loadPageLines() -> parseNotes()
  └ deriveCardIds() -> loadCards()
  └ buildQueues()
  └ loop {
        pickNext() -> present()
        await rating
        applyAnswer() -> fsrs.next() -> updateInMemory()
        enqueueRelearnOrSchedule()
        persistBuffered()
     }
  └ finalize() -> flush() -> showSummary()
```

## 3. 今後のディレクトリ再編案

```
core/
  domain/
    note.ts
    card.ts
    scheduler.ts (新規)
  infra/
    card_storage.ts
    review_log_storage.ts
  session/
    start.ts (旧 startReview 分割)
    hooks.ts
    queue.ts
```

## 4. 依存方向原則

UI -> Application -> Domain -> (Infrastructure, External)

- 逆方向参照禁止 (Domain が UI を import しない)
- Domain は `Date.now()` 直接呼ばず、時間は引数注入 (テスト容易性)

## 5. エラーハンドリング方針

| 種別             | 例                       | UI 反映                 | リトライ               |
| ---------------- | ------------------------ | ----------------------- | ---------------------- |
| NetworkTransient | 一時的接続失敗           | トースト (再試行n/最大) | 自動エクスポネンシャル |
| Conflict         | 競合検出(ハッシュ不一致) | ダイアログ差分表示      | ユーザ選択             |
| Validation       | 不正データ (パース失敗)  | 警告 + 該当行強調       | 手動                   |
| Fatal            | 想定外例外               | バグレポートリンク      | なし                   |

## 6. イベント / Hook (計画)

| イベント        | Payload                      | 用途             |
| --------------- | ---------------------------- | ---------------- |
| onSessionStart  | { counts }                   | HUD 初期化       |
| onCardShown     | { cardId, queueType }        | 計測開始         |
| onShowAnswer    | { cardId, elapsedMs }        | 応答時間記録     |
| onAnswerApplied | { cardId, rating, newState } | メトリクス集計   |
| onPersist       | { batchSize, latency }       | ネットワーク監視 |
| onSessionEnd    | { summary }                  | サマリー描画     |

## 7. テスト戦略層別

| 層         | テスト種別     | 例                           |
| ---------- | -------------- | ---------------------------- |
| Domain     | ユニット       | Cloze抽出, FSRS適用ラッパ    |
| Session    | 統合           | pickNext順序, Learning再投入 |
| Infra      | 変換           | CSV->Card Stream, patch差分  |
| UI         | コンポーネント | HUD表示, キー操作            |
| E2E (拡張) | シナリオ       | 新規20枚 + レビュー継続      |

## 8. パフォーマンス注意点

| 項目             | リスク           | 対策                             |
| ---------------- | ---------------- | -------------------------------- |
| 大量カードロード | 全件 Map 化 O(n) | 遅延読み込み or due window先読み |
| 頻繁 patch       | 高レイテンシ     | バッチ + debounce                |
| 大量ログ集計     | 日次 O(n)        | インクリメンタル集計キャッシュ   |

## 9. セキュリティ / サンドボックス

- 他ユーザ table 参照時はサーバ側認可エラー確認 (403/404 区別)
- 予期しない HTML/JS 注入を CSS ビュー層で隔離 (Shadow DOM)

## 10. 拡張性パターン

| パターン | 例                   | 利点              |
| -------- | -------------------- | ----------------- |
| Strategy | pickNext 実装差替    | A/B 実験容易      |
| Observer | Hook イベント        | メトリクス分離    |
| Adapter  | ts-fsrs ラッパ       | 変更最小化        |
| Snapshot | セッション終了時状態 | 復旧/再開サポート |

---

補足は [scheduling_strategy.md](./scheduling_strategy.md),
[data_model_and_storage.md](./data_model_and_storage.md) 参照。
