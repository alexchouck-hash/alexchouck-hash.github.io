# Font licences

All three families are licensed under the SIL Open Font License, Version 1.1,
which permits self-hosting and redistribution with the software. The full OFL
text ships with each family upstream; keep it with these files if this
directory is redistributed on its own.

| File | Family | Upstream | Licence |
|---|---|---|---|
| `space-grotesk-var.woff2` | Space Grotesk (variable, latin subset) | https://github.com/floriankarsten/space-grotesk | SIL OFL 1.1 |
| `inter-var.woff2` | Inter (variable, latin subset) | https://github.com/rsms/inter | SIL OFL 1.1 |
| `ibm-plex-mono-400.woff2`, `ibm-plex-mono-500.woff2` | IBM Plex Mono (latin subset) | https://github.com/IBM/plex | SIL OFL 1.1 |

Subsets were taken from the Google Fonts CDN and stored locally. Nothing on the
site loads a font from a third-party host at runtime — that is enforced by
`npm run qa`.
