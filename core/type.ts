/** メタデータ付き行
 *
 * `consense-srs`で必要なものだけ抽出している
 */
export interface Line {
  /** line text */
  text: string;
  /** line id */
  id: string;
  /** created time of the line */
  created: number;
  /** updated time of the line */
  updated: number;
}

/** ページデータ
 *
 * `consense-srs`で必要なものだけ抽出している
 */
export interface Page {
  /** page title */
  title: string;
  /** created time of the page */
  created: number;
  /** updated time of the page */
  updated: number;
  /** lines in the page */
  lines: Line[];
}
