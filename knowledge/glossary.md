# 用語集 (Glossary)

| 用語               | 定義                                         | 備考                       |
| ------------------ | -------------------------------------------- | -------------------------- |
| Note               | 1つ以上の Cloze を含む最小学習単位           | GUID で識別                |
| Cloze              | テキスト中の穴埋め (番号付き)                | 同一Note内で siblings      |
| Card               | Cloze に対応する記憶トラッキングエンティティ | FSRS状態保持               |
| Sibling            | 同一Note内の別Clozeカード                    | bury 対象                  |
| Stability          | 記憶保持力指標                               | 大きいほど忘却遅い         |
| Difficulty         | 主観的難度尺度                               | FSRSで 1~? 範囲 (実装依存) |
| Retrievability     | 現時点の想定想起確率                         | 1-R が忘却確率             |
| Learning Steps     | 短期間隔再出題フェーズ                       | 完了で Review 移行         |
| Lapse              | 再学習 (Again) 発生数                        | leech 判定材料             |
| Leech              | 頻繁に忘却されるカード                       | サスペンド/改善対象        |
| Bury               | 一時的出題抑止                               | siblings/新規衝突回避      |
| Backlog            | 期限超過カード集合                           | 平準化対象                 |
| Fuzz               | Interval に加える小乱数                      | 平準化/負荷分散            |
| Target Retention   | 目標保持率                                   | 次回間隔計算基準           |
| Retention Gap      | 期待と実測差                                 | モデル調整トリガ           |
| Review Log         | 過去回答記録                                 | パラメータ推定入力         |
| Queue              | 出題順制御用データ構造                       | learning/review/new 等     |
| Persist Flush      | バッチ書込タイミング                         | 信頼性指標                 |
| Deterministic Fuzz | 冪等性保持した乱数                           | hash(seed) 利用            |
| Session            | 連続した学習操作単位                         | HUD/サマリー対象           |
| HUD                | Head-Up Display 進捗表示                     | 残数/統計                  |
| Leech Threshold    | leech 化 lapses 回数                         | 設定値                     |
| Overdue Ratio      | overdue / active                             | backlog 健康度             |

---

必要に応じ追加予定。変更時は関連ドキュメントリンク更新。
