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

export async function listPRComments(octokit, repoFullName, prNumber, since) {
  const { owner, repo } = parseRepo(repoFullName);
  const params = { owner, repo, issue_number: prNumber, per_page: 100 };
  if (since) params.since = since;
  const response = await octokit.issues.listComments(params);
  return response.data;
}
