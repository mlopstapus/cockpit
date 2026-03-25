When cockpit implements a feature on itself and restarts, any in-flight PR review jobs are orphaned (recovered on next boot, but still interrupted mid-run).

Consider draining the PR review queue before restarting: check if any pr_review_jobs are active before executing a restart, and either wait for them to complete or skip the restart if work is in flight. Alternatively, detect that the repo being implemented is cockpit itself and omit the redeploy instruction from the prompt.
