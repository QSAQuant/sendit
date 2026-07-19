# Deploy public demo

**Live URL:** https://qsaquant.github.io/sendit/

## How it works
Static `dist/` is force-pushed to the `gh-pages` branch (GitHub Pages legacy source).  
GitHub Actions workflow is not used — the Cursor/gh OAuth token lacks `workflow` scope.

## Redeploy after code changes
From repo root on `main`:

```powershell
npm run build
$tmp = Join-Path $env:TEMP "sendit-gh-pages"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $tmp | Out-Null
Copy-Item dist\* $tmp -Recurse -Force
New-Item -ItemType File -Path "$tmp\.nojekyll" -Force | Out-Null
Push-Location $tmp
git init -b gh-pages
git add -A
git -c user.name=QSAQuant -c user.email=253535796+QSAQuant@users.noreply.github.com commit -m "Publish SENDIT demo"
git remote add origin https://github.com/QSAQuant/sendit.git
git push -f origin gh-pages
Pop-Location
```

Or ask the agent to redeploy.
