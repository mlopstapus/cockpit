// All emoji prefixes used by Cockpit's own bot comments.
// Used by both issue and PR comment filters to prevent processing own comments.
export const BOT_COMMENT_PREFIXES = ['👀', '💬', '🚀', '✅', '❌', '⚠️', '🎉'];

function parseRepo(repoFullName) {
  const [owner, repo] = repoFullName.split('/');
  return { owner, repo };
}

export async function postIssueComment(octokit, repoFullName, issueNumber, body) {
  const { owner, repo } = parseRepo(repoFullName);
  return octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

export async function listIssueComments(octokit, repoFullName, issueNumber, since) {
  const { owner, repo } = parseRepo(repoFullName);
  const params = { owner, repo, issue_number: issueNumber, per_page: 100 };
  if (since) params.since = since;
  const response = await octokit.issues.listComments(params);
  return response.data;
}

// PR comments use the issues endpoint (GitHub treats PRs as issues for comments)
export async function postPRComment(octokit, repoFullName, prNumber, body) {
  const { owner, repo } = parseRepo(repoFullName);
  return octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
}

// Returns all human-visible comments on a PR: both the conversation thread
// (issues.listComments) and inline code review comments (pulls.listReviewComments).
// Each returned object has { id, body, user, created_at } normalised from both sources.
export async function listPRComments(octokit, repoFullName, prNumber, since) {
  const { owner, repo } = parseRepo(repoFullName);
  const params = { owner, repo, per_page: 100 };
  if (since) params.since = since;

  const handle304 = (err) => {
    if (err.status === 304) return { data: [] };
    throw err;
  };

  const [issueRes, reviewRes] = await Promise.all([
    octokit.issues.listComments({ ...params, issue_number: prNumber }).catch(handle304),
    octokit.pulls.listReviewComments({ ...params, pull_number: prNumber }).catch(handle304),
  ]);

  return [
    ...issueRes.data,
    ...reviewRes.data,
  ];
}
