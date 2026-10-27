# PodPick project rules

## GitHub
- Repo: github.com/varshithreddy-tech/podpick (public). Keys never go in the repo.
- `.env.local` must stay in `.gitignore`. Never commit any key. If a key was ever committed, tell the user immediately so they can rotate it.
- After each build step is DONE, commit with a clear message and push.
- At the end of every session, push the latest changes and tell the user the latest commit and the repo link.
- Final step: deploy on Vercel by importing this GitHub repo and adding every key from `.env.local` in Vercel's settings. DONE only when the latest code is on GitHub and the public Vercel URL works on both phones and a laptop.
- Commit messages end with: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`
