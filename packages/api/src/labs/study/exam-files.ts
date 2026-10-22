// The only caller of the GitHub write client (core/github-write.ts): exam
// files beside a course, `Study Lab/<area>/<topic>/<topic>__<level>__exam-<n>.md`,
// and nothing else, so the write token can't touch a course or any other file.
// Removal (a deleted exam's files, ST-14) also reaches the exam's `.pdf`;
// writing never does.
import { parseExamPath } from "@projects-lab/shared/study";
import {
  deleteFile,
  type GitHubWriteDeps,
  githubWriteDeps,
  putFile,
  updateFile,
} from "../../core/github-write";

/** The write token's deps: exam files only, through the functions below. */
export const examWriteDeps = githubWriteDeps;

function examFileOnly(path: string) {
  if (parseExamPath(path)?.extension !== "md")
    throw new Error(`Not an exam file the app may write: ${path}`);
}

export async function writeExamFile(
  deps: GitHubWriteDeps,
  path: string,
  text: string,
  message: string,
) {
  examFileOnly(path);
  return putFile(deps, path, text, message);
}

export async function removeExamFile(
  deps: GitHubWriteDeps,
  path: string,
  sha: string,
  message: string,
) {
  if (!parseExamPath(path))
    throw new Error(`Not an exam file the app may remove: ${path}`);
  await deleteFile(deps, path, sha, message);
}

/** An exam file's new content (its Results appended), given its current SHA. */
export async function rewriteExamFile(
  deps: GitHubWriteDeps,
  path: string,
  text: string,
  message: string,
  sha: string,
) {
  examFileOnly(path);
  return updateFile(deps, path, text, message, sha);
}
