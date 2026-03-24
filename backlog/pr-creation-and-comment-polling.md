Cockpit should guarantee a PR is created at the end of the pipeline regardless of whether implement succeeded or failed — if implement fails partway through, Claude should still push the branch and open a draft PR with what it has so far. This gives the human something to review rather than nothing.

Once a PR is open, Cockpit should poll it for reviewer comments and feed them back to Claude to incorporate. The goal is a tight loop: human reviews PR → leaves comments → Cockpit picks them up → Claude pushes fixes → repeat until the human merges.
