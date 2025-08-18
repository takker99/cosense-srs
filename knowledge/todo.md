# 開発ロードマップ / TODO (v1 Draft)

本計画は [srs_design_gaps.md](./srs_design_gaps.md) と
[architecture.md](./architecture.md)
の分析を踏まえ、最小実用(MVP)から高度化までを段階的に進める指針です。優先度は上から順、同一フェーズ内は並行可。各項目に
Done 判定基準(AC) と計測指標(KPI) を付与。

---
## フェーズ0: Core Correctness & Safety (最優先)
目的: 現行セッションの正当性とデータ整合性を確保し、学習体験を最低限成立させる。

1. インメモリ更新 & 再出題反映
   - 内容: `startReview` TODO解消。回答後に `cardsInThePage` を更新し、学習ステップ/再学習カードを適切な位置に再挿入(暫定: 学習中カードは直近数枚後へ)。
   - AC: 連続回答で state / due / stability が変化し再取得なしで UI に反映。再学習カードが同セッションで少なくとも1回再出題。
   - KPI: セッション中 `alert` 表示される Learning/Review 数が回答ごとに合理的に減少。
2. Atomic Write (暫定バッチ)
   - 内容: 回答1件につき Card + ReviewLog をまとめて await Promise.all で失敗時 rollback (メモリ復元)。完全原子性は後続。
   - AC: 片方失敗時にメモリ更新を取り消し、ユーザに再試行オプション提示。
   - KPI: 手動障害テスト (強制失敗) で不整合ゼロ。
3. エラーUI基盤
   - 内容: `alert` 置換: 非モーダルトースト + 詳細パネル (stack/原因)。
   - AC: 通信失敗/パース失敗/保存失敗で種類別メッセージ表示。
4. ユーザー名取得抽象化
   - 内容: `username: "takker"` を設定取得API (暫定モック) に置換。
   - AC: コードからハードコード文字列が除去。

## フェーズ1: Scheduling Infrastructure
目的: 基本的SRSキュー戦略を導入し、FSRSの利点を活かす。

1. QueueBuilder 実装
   - 内容: カード集合を New/Learning/Review へ分類し優先度合成 (Learning > Due Review > Overdue Review > New)。
   - AC: ログ出力でキュー構築順が可視化。全カードを単純シャッフルしない。
2. 学習ステップ再出題タイマー
   - 内容: FSRSカード state=Learning 時に短時間間隔(例 1分, 5分)再挿入。UI上は同カードに "(Step 2/2)" 表示。
   - AC: Hard/Again で短期再出題; Good/Easy で次の長期間隔。
3. 基本HUD
   - 内容: 画面上に Remaining: New X / Lrn Y / Rev Z を常時表示。
   - AC: 回答後即時更新。
4. セッション終了サマリー
   - 内容: 正答率(成功/総数), 平均レーティング, 新規投入数表示。
   - KPI: 正答率/新規割合を後続分析に活用。

# 開発ロードマップ / TODO

学習理論・スケジューリング設計文書を踏まえ、短 / 中 / 長期の段階的計画に再整理。\
凡例: P = 優先度 (5 高) / Effort = 相対工数 (S,M,L) / Phase = 実装フェーズ (A..E)

## フェーズ概要
| Phase | 目的 | 主題 |
|-------|------|------|
| A | 最低限正しいセッション | メモリ更新, 三分割キュー, 進捗表示 |
| B | 学習体験向上 | Learning steps, bury, サマリー, バッチ書込(簡易) |
| C | 負荷平準化 & 指標 | backlog 平準化, fuzz, 基本メトリクス |
| D | 信頼性 / オフライン | 競合解決, オフラインキュー, 冪等性 |
| E | 適応・最適化 | パラメータ推定, Retention 制御, 高度ダッシュボード |

## Phase A (MVP 強化) ✅ 完了 (2025-08-18)
| ID | タスク | 詳細 / Acceptance | P | Effort |
|----|--------|-------------------|---|--------|
| A1 | メモリ内カード更新 | 回答直後に `Map` を置換。`state`/`due` 反映確認テスト。 | 5 | S |
| A2 | 簡易キュー分割 | new/review/learning FIFO 実装し pickNext 優先順位実装。 | 5 | M |
| A3 | 進捗 HUD | 残数 (New/Learning/Review) と経過枚数を常時表示。 | 4 | S |
| A4 | セッション終了条件 | すべてキュー空 or 手動終了時サマリー呼び出し。 | 4 | S |
| A5 | リファクタ `startReview` | 主要責務を関数分割 (load, loop, applyAnswer)。 | 3 | M |
| A6 | テスト拡充(PhaseA) | A1/A2 pickNext, メモリ更新, サマリー snapshot。 | 4 | M |

補足: A5 では `core/session.ts` を新設し `applyAnswer`, `buildQueues`, `pickNext`, `summarizeSession` など純粋ロジックを分離。`main.ts` は UI + I/O オーケストレーションへ縮退。A6 で新規 `session.test.ts` を追加しキュー優先順位 / 再挿入 / サマリー / rating 変換を検証。Phase A aggregate coverage Lines 84.5%, Branches 93.1% (ポリシー閾値超過)。

## Phase B (学習体験 / 安定性) ✅ 完了 (2025-08-18)
| ID | タスク | 状態 / 実装要点 | 完了日 |
|----|--------|----------------|--------|
| B1 | Learning Steps | `session` で learning steps 再挿入 `[1,10]` 分相当 | 2025-08-18 |
| B2 | Cloze sibling bury | 同一 note Cloze 初出題後 bury map 管理 | 2025-08-18 |
| B3 | 回答サマリー UI | 正答率 / 新規投入 / lapses (基礎) | 2025-08-18 |
| B4 | バッチ書込(単純) | PersistenceBuffer 10件 or 30s flush | 2025-08-18 |
| B5 | エラー表示改善 | alert→toast (info/error) 置換 | 2025-08-18 |
| B6 | 応答時間計測収集 | review log 末尾列 `response_time_ms` (後方互換) | 2025-08-18 |

## Phase C (負荷平準化 / 基本メトリクス)
| ID | タスク | 詳細 / Acceptance | P | Effort |
|----|--------|-------------------|---|--------|
| C1 | Interval fuzz (deterministic) | ±5% hash ベース; テストで再現性確認。 | 4 | S |
| C2 | Backlog 平準化 | 30 日 due 予測; 過負荷判定で new limit 自動調整。 | 4 | M |
| C3 | Daily new limit 実装 | 設定値超過時 newQueue 停止。 | 4 | S |
| C4 | 基本メトリクス集計 | Retention, Overdue Ratio, Reviews Count API。 | 4 | M |
| C5 | HUD メトリクス統合 | Overdue/今日完了/残 new 表示。 | 3 | S |
| C6 | Leech フラグ | lapses>=閾値で suspendedQueue 移動。 | 3 | S |

## Phase D (信頼性 / オフライン / 競合)
| ID | タスク | 詳細 / Acceptance | P | Effort |
|----|--------|-------------------|---|--------|
| D1 | 競合検出 | 行ハッシュ埋込→不一致時マージ戦略実装。 | 5 | L |
| D2 | オフライン検知 | fetch 失敗→ローカルキュー (IndexedDB) 保持。 | 5 | M |
| D3 | 冪等再送 | (cardId,last_review) キー去重。 | 4 | M |
| D4 | ログ圧縮 PoC | 古い revlog 週次集約。 | 3 | M |
| D5 | テスト (オフライン) | モックで遅延/失敗再送ケース。 | 4 | M |

## Phase E (適応 / 最適化)
| ID | タスク | 詳細 / Acceptance | P | Effort |
|----|--------|-------------------|---|--------|
| E1 | パラメータ推定 (Batch) | 300+ ログ時に MLE; before/after 尤度比較。 | 5 | L |
| E2 | Retention 目標制御 | Gap >閾値 継続時 RT ±0.02 自動調整。 | 5 | M |
| E3 | 難易度ドリフト監視 | difficulty 中央値移動>0.1 で再推定トリガ。 | 4 | S |
| E4 | 応答時間補正 | t_answer に応じ FSRS 入力 rating 補正。 | 3 | M |
| E5 | ダッシュボード | 主要メトリクス + 30 日負荷ヒートマップ。 | 4 | M |
| E6 | 実験フレーム | fuzzPercent A/B ログ分離 + 比較。 | 3 | L |

## 横断タスク
| ID | タスク | 説明 | P | Effort |
|----|--------|------|---|--------|
| X1 | Config 実装 | UserConfig 読込 + default merge | 4 | S |
| X2 | GUID 重複検出 | 同一ページで二重 GUID → 警告 & 後勝ち | 3 | S |
| X3 | カバレッジ可視化 | Deno coverage レポート 80% 目標 | 3 | S |
| X4 | Anki エクスポート | 最低限 TSV 生成 | 2 | M |
| X5 | ドキュメント整備 | 仕様更新フック CI チェック | 2 | S |

## 依存関係 (例)
```
A1 -> A2 -> A3 -> A4
A2 -> B1
B1 -> B2
A1 -> B4 -> D1 -> D2
C4 -> E2/E5
```

## 直近アクション推奨 (Top 5) - Phase C へ移行
1. C1 Interval fuzz (決定的 ±5%)
2. C4 基本メトリクス集計 (Retention / Overdue)
3. C2 Backlog 平準化 (過負荷制御)
4. C3 Daily new limit 実装
5. C6 Leech フラグ (lapses>=閾値)

## テスト指針 (Phase A)
実行コマンド: `deno task coverage` を標準運用とし、テストと同時に coverage HTML レポートを生成。

| ケース | 期待 | 計測/確認 |
|--------|------|-----------|
| 新規カードのみ | A2 で newQueue 全消費後終了 | セッションループ後 pickNext=null で終了 |
| 回答後 state 変化 | A1 適用で Map 内 due/stability 更新 | before/after 比較 assert |
| シャッフル非依存 pick | A2 実装で学習中優先 pick | learningQueue 存在時常に先頭取得テスト |
| 進捗 HUD カウント | 回答ごとに減少一致 | DOM query で数値差分検証 |
| サマリー出力 | 全キュー空でサマリー表示 | テキスト/DOM スナップショット |
| カバレッジ閾値 | 全体 lines >= 80% (*1) | coverage レポート自動目視 / 将来 CI Gate |
| X3 | カバレッジ可視化 | `deno task coverage` で HTML 出力 (方針 *1) | 3 | S |

> (*1) 2025-08-18 改訂: モジュール特性に応じた段階的閾値制御を導入。
> - Pure (副作用なし, 計算/変換のみ) モジュール: lines & branches 100% 目標 (例: `make_note_guid.ts`, `empty_stream.ts` 達成済)
> - Core アルゴリズム / スケジューリング中核: lines >= 90%, branches >= 85%（`note.ts` 91.4% lines 達成）
> - I/O / パッチ生成など副作用密集 (現状リファクタ前): 暫定 lines >= 75% (例: `card_storage.ts` 82.4%, `review_log_storage.ts` 80.3%)
> - 例外: テスト困難なブランチ（Deno fetch 失敗経路等）は D フェーズ以降 DI 導入後に引き上げ
> - 全体 (aggregate) lines >= 80% 維持で品質ゲート PASS
> 次回見直しポイント: フェーズ D1 (競合検出/リファクタ) 完了後、副作用モジュールを純粋ロジック + 薄い I/O ラッパへ分割し per-file 90%+ を再目標化

## Acceptance Checklist (A1 例)
* 回答直後に `cardsInThePage.get(id)` の `due` が新値
* 直後出題候補再計算で Learning が最優先
* ユニットテストで FSRS `next` 結果と格納値一致
---

補助資料: [learning_theory.md](./learning_theory.md),
[scheduling_strategy.md](./scheduling_strategy.md),
[metrics_and_evaluation.md](./metrics_and_evaluation.md)。

## フェーズ2: Observability & Test

目的: 品質計測と回帰防止。

1. ドメイン分離(refactor `startReview`)
   - 内容: SessionController / QueueBuilder / FeedbackApplier / StorageAdapter
     へ分割。
   - AC: `startReview` 本体 100行未満、純粋ロジックは副作用注入せずテスト可能。
2. 単体テスト拡充
   - 内容: キュー順序, 再出題タイミング, update関数,
     失敗時ロールバックをテスト。
   - AC: `deno test` で新規 >10ケース追加、全緑。
3. メトリクス収集インタフェース
   - 内容: onAnswer イベントで in-memory stats を更新し終了時 export。
   - AC: サマリーに (平均間隔, 平均安定度変化Δ) を表示 (可能なら)。

---
## フェーズ3: Personalization & Advanced Heuristics
目的: 個人最適化と高効率運用。

1. FSRSパラメータ永続化
   - 内容: user settings table 追加し JSON埋込。読み込み時に適用。
   - AC: 2回目セッション開始時にカスタム値が反映。
2. Difficulty微調整UI
   - 内容: カード詳細パネルで ± ボタンによりdifficulty補正、即時保存。
   - AC: 補正後 next scheduling に影響 (ログ確認)。
3. Sibling Bury (最小)
   - 内容: 同 noteId の未出題カードは当日キュー末尾へ移動。
   - AC: 連続表示抑制(テストでN=10中 2連続以下目標)。
4. Leech検出
   - 内容: lapses>=閾値でタグ付けし当日除外。
   - AC: 対象カードがサマリーに "Leech: n" と表示。
---

## フェーズ4: Resilience & Scaling

目的: データ競合・大規模対応。

1. Version Stamp 付与
   - 内容: table先頭メタ行 `meta:version=<n>`。パッチ前後で比較し競合検出。
   - AC: 並行セッションで競合時リトライ or ユーザー選択表示。
2. Lazy Load / Due Filter
   - 内容: due<=today + 少量余剰のみロード; 新規は需要時生成。
   - KPI: 1万カードで初期ロード時間 < 1s (mock測定)。
3. バッチFlush最適化
   - 内容: 複数回答を一定間隔/件数でまとめ書き。
   - AC: ネットワークリクエスト数 50% 減 (測定基準: 100回答セッション)。

---
## フェーズ5: Analytics & Research Hooks
目的: 研究・改善用データ供給。

1. ReviewLog エクスポート
   - 内容: JSON/CSVダウンロードボタン。
2. 週間負荷予測グラフ
   - 内容: due日ヒストグラム簡易描画。
3. 実験フラグ仕組み
   - 内容: feature flag (URL hash / settings) で sibling bury など切替。
---

## フェーズ6: UX Polish / Accessibility

1. キーボードショートカット (1=Again,2=Hard,3=Good,4=Easy)
2. フォーカス可視リング & SR向けARIAラベル
3. i18nメッセージ抽出 (en/ja)

---
## Backlog (検討中)
- Adaptive load balancing (未来間隔再分配)
- Interleaving最適化 (タグ混在度制御)
- 反応時間計測 + 遅延フィードバック実験
- Early mastery detection (高stabilityカットオフ)
---

## 追跡方法

- 各タスクは `tests/` か `knowledge/changelog.md` に進捗記録。
- KPI は週次でスナップショット。

---

## 参照

- [srs_design_gaps.md](./srs_design_gaps.md),
  [architecture.md](./architecture.md),
  [research_notes.md](./research_notes.md), [glossary.md](./glossary.md)
