/** scrapboxのページを一意に特定するパス */
export interface Path {
  project: string;
  title: string;
  hash?: string;
}

/** /:project/:title 形式のパスから:projectと:titleを抜き出す。
 *
 * それ以外は、page titleをそのまま渡されたと解釈する。
 */
export const parsePath = (path: string, defaultProject: string): Path => {
  const [, project, title] = path.match(/^\/([\w\-]+)\/(.+)$/) ?? [];
  const hash = title?.match?.(/#([a-f\d]{24,32})$/)?.[1];
  return project && title
    ? { project, title, hash }
    : { project: defaultProject, title: path, hash };
};
