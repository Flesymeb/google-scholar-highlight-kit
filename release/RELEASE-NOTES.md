# Scholar Highlight Kit v1.0.0

First unified release across browsers.

## Highlights

- Paper mode: on an arXiv (abs / pdf / html) or Scholar paper page, the popup
  detects the paper, searches it automatically, and shows a paper card with
  Cite, BibTeX, and Related-article links plus a prominent citation count
- Availability badges: arXiv preprint, GitHub code, and Hugging Face model
  are checked for the detected paper; badges are gray when absent and
  colored when found, clicking opens the exact page
- In-popup Scholar search for any query
- On profile pages: authorship-role highlighting (first, co-first, second,
  corresponding, last), subset metrics, role/year filters, author-name
  marking, screenshot capture

## Packages

| File | Browser | Status |
|---|---|---|
| `scholar-highlight-kit-1.0.0-chrome.zip` | Chrome / Chromium / Edge | Load unpacked via `chrome://extensions` |
| `scholar-highlight-kit-1.0.0-firefox-zen.xpi` | Zen / Firefox | Unsigned — temporary load via `about:debugging` |
| `scholar-highlight-kit-1.0.0-firefox-zen.zip` | Zen / Firefox | Same package, zip form |

Note: the Firefox/Zen build is unsigned because AMO is rate-limiting this
account. For a permanently installable build, run:

```sh
npx web-ext sign --source-dir zen --api-key <issuer> --api-secret <secret> --channel unlisted
```

A signed xpi will be attached once available.
