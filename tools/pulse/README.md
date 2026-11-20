# openGym Pulse

Scripts behind the "openGym Pulse" dashboard: activity, review load, the open pull-request queue,
issue themes and contributor retention for the upstream repository `DuarteSantos8/openGym`.
They only read public data: git over HTTPS and the GitHub search API through `gh`.

## Run

```bash
tools/pulse/run.sh /path/to/data
```

`run.sh` calls, in order:

| Step | Script | Writes |
|---|---|---|
| Upstream branches, tags, CLA log, changelog | `export_git.sh` | `commits_raw.txt`, `bodies.txt`, `tags.txt`, `cla.txt`, `CHANGELOG.md` |
| Every issue and pull request | `fetch_items.sh` | `items.jsonl` |
| Heads of open pull requests | `fetch_prs.sh` | `refs/pr/<n>` in the clone |
| Merge checks against main and the newest release branch | `pr_git_state.py` | `new/open_prs_git.json` |
| Review signals from search qualifiers | `review_signals.py` | `new/review_signals.json` |
| Contributor cohorts | `cohorts.py` | `new/cohorts.json` |
| Base datasets | `analyze.py` | `out/weekly, daily, hours, releases, people, areas, summary` |
| Extra datasets | `extend.py` | `out/open_prs, reviewers, themes, theme_months, labels, stability, retention`, rows added to `summary` |

`SNAPSHOT=YYYY-MM-DD` pins the "today" the numbers are measured against (default: today, UTC).
`PULSE_ME` names the GitHub login shown as "you" (default `cubetes`).

## Title classification

`extend.py` reads `new/classification.json`, a list of `{n, theme, kind}`. It is made by Claude
reading each issue and pull-request title, not by a script. To refresh it, start from the
dashboard's `labels` dataset (the previous classification), classify only numbers that are not in
it, using the themes and kinds in `THEMES.md`, and save the merged list before running `extend.py`.

## Caveats

- The search API returns what still exists; deleted issues and pull requests are missing.
- "Credited elsewhere" means a closed, unmerged pull request whose number appears in a commit
  message or the changelog.
- Review signals come from search qualifiers (`commenter:`, `review:`), so they count pull
  requests or issues with at least one comment from a person, not the number of comments.
