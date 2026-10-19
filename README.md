# Google Scholar Highlight Kit

A browser extension that highlights papers by authorship role on Google Scholar
profile pages, with metrics, filters, and screenshots. Built for Zen / Firefox.

## Features

- Highlights first, co-first, second, corresponding, and last-author papers
- Authorship metrics for the highlighted subset (citations, h-index, i10)
- Filter by role and year; optionally hide non-highlighted papers
- Author name highlighting
- Screenshot of results (copy or download)
- Last-author detection via public metadata (OpenAlex, Crossref, DataCite,
  arXiv) with local caching and rate limiting

## Install

**Zen / Firefox (temporary, until restart):** open
`about:debugging#/runtime/this-firefox`, click *Load Temporary Add-on*, and
pick the `.xpi` file.

**Permanent:** Firefox-based browsers require a signed package. With an
[AMO](https://addons.mozilla.org) API key:

```sh
npx web-ext sign --source-dir zen --api-key <issuer> --api-secret <secret> --channel unlisted
```

Then install the signed `.xpi` via `about:addons` → gear menu →
*Install Add-on From File*.

## Build

```sh
npx web-ext lint --source-dir zen
npx web-ext build --source-dir zen
```

## Reference

Based on [Google Scholar Author Highlighter](https://chromewebstore.google.com/detail/google-scholar-author-hig/ijmngekkpaccbbjimedfkjpigplaikah)
by Yue Deng. For personal use.
