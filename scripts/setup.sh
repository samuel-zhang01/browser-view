#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
allow_no_sandbox=false
cli="${BROWSER_VIEW_EDITOR_CLI:-}"
while [[ $# -gt 0 ]]; do
 case "$1" in
  --allow-no-sandbox) allow_no_sandbox=true; shift ;;
  --editor) [[ $# -ge 2 ]] || { echo '--editor needs code or code-server'; exit 1; }; cli="$2"; shift 2 ;;
  *) echo 'Usage: setup.sh [--editor code|code-server|/path/to/cli] [--allow-no-sandbox]'; exit 1 ;;
 esac
done
for dependency in python3 node Xvfb xauth x11vnc websockify; do
 if ! command -v "$dependency" >/dev/null; then
  echo "Missing $dependency. Install Node.js 22+, Python 3, and: sudo apt-get install xvfb xauth x11vnc websockify"
  exit 1
 fi
done
if ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then echo 'Node.js 22 or newer is required.'; exit 1; fi
if [[ -z "$cli" ]]; then
 if command -v code >/dev/null; then cli=code; elif command -v code-server >/dev/null; then cli=code-server; else echo 'Install VS Code or code-server first.'; exit 1; fi
fi
version="$(node -p 'require(process.argv[1]).version' "$project_dir/package.json")"
vsix="$project_dir/dist/browser-view-$version.vsix"
if [[ ! -f "$vsix" ]]; then echo "Missing $vsix. Download the matching GitHub release asset into dist/, or run npm ci && npm run package."; exit 1; fi
"$cli" --install-extension "$vsix" --force
skill_dir="${CODEX_HOME:-$HOME/.codex}/skills/browser-view"
mkdir -p "$skill_dir" "$HOME/.local/bin" "$HOME/.config/browser-view"
cp -R "$project_dir/skill/browser-view/." "$skill_dir/"
ln -sfn "$skill_dir/scripts/browser-view" "$HOME/.local/bin/browser-view"
if [[ "$allow_no_sandbox" == true ]]; then
 python3 - <<'PY'
import json, os
from pathlib import Path
os.umask(0o077)
p=Path.home()/'.config/browser-view/settings.json'
data=json.loads(p.read_text()) if p.exists() else {}
data['allowNoSandbox']=True
p.write_text(json.dumps(data,indent=2)+'\n'); p.chmod(0o600)
PY
 echo 'CLI sandbox exception saved. Also enable browserView.allowNoSandbox in editor user/remote machine settings for this isolated root host.'
fi
extension_dir="$("$HOME/.local/bin/browser-view" --root)"
if ! command -v chromium >/dev/null && ! command -v chromium-browser >/dev/null && ! command -v google-chrome >/dev/null && ! compgen -G "$HOME/.cache/ms-playwright/chromium-*/chrome-linux*/chrome" >/dev/null; then
 node "$extension_dir/node_modules/playwright-core/cli.js" install chromium
fi
echo 'Installed. Run Developer: Reload Window in each open editor window, then Browser View: Open Shared Browser. Add ~/.local/bin to PATH to use the optional CLI.'
