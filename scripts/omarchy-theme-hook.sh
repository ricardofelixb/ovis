#!/bin/bash
# Sends this machine's Omarchy theme to Ovis, so a browser here with Settings → Appearance →
# Follow Omarchy on is drawn in it. Omarchy runs it after every theme change; run it once by hand
# after installing. Install it on each Omarchy machine:
#
#   install -m 755 scripts/omarchy-theme-hook.sh ~/.config/omarchy/hooks/theme-set.d/ovis
#
# OVIS_URL names the Ovis this machine opens (set it in the hook's environment, or edit the default
# below); several may be given, separated by spaces. The request reaches Ovis as this machine's
# browser does, through Tailscale, which is how Ovis tells this machine's theme from another's.

urls="${OVIS_URL:-https://orgo-desktop.tailb4e5ae.ts.net:8443}"
colors="$HOME/.local/state/omarchy/current/theme/colors.toml"
[[ -f $colors ]] || colors="$HOME/.config/omarchy/current/theme/colors.toml"
[[ -f $colors ]] || exit 0
name="${1:-$(cat "$HOME/.local/state/omarchy/current/theme.name" 2>/dev/null)}"

# in the background: a theme change does not wait on the network
(
  for url in $urls; do
    curl -fsS --max-time 10 -X PUT -H "x-herdr-machine: 1" -H "content-type: text/plain" \
      --data-binary "@$colors" --url-query "name=$name" "${url%/}/api/machines/omarchy-theme" >/dev/null 2>&1
  done
) &
