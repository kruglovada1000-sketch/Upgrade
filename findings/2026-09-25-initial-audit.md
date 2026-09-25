# Initial audit — ohrana.tech

Date: 2026-09-25
Source: first automated `Upgrade` workflow run.

## Scope

- Static HTML SEO scan
- Local link resolution
- Lychee HTTP link check
- Lighthouse collection for the live home page

## Static scan

156 HTML files were scanned in the first run (before search-engine verification files were excluded from future scans).

### Duplicate titles requiring review

1. `stati/nochnaya-ohrana-obektov.html` and `stati/nochnaya-ohrana.html`
2. `stati/ohrana-meropriyatiy-v-moskve.html` and `ohrana-meropriyatiy-v-moskve/index.html`
3. `stati/soprovozhdenie-gruzov.html` and `soprovozhdenie-gruzov/index.html`

### Missing canonical warnings

- `index.html`
- `kommercheskoe-predlozhenie/index.html`
- `images/logo-animation.html`

Google/Yandex verification files were also reported in the first run, but these are service files rather than normal landing pages. The scanner has already been adjusted to ignore them in future runs.

### Pages under `uslugi/` without an H1 in the first scan

- `uslugi/ohrana-skladov/index.html`
- `uslugi/ohrana-parkovok/index.html`
- `uslugi/ohrana-avtosalonov/index.html`
- `uslugi/ohrana-ofisov/index.html`
- `uslugi/ohrana-magazinov/index.html`
- `uslugi/ohrana-stroitelnyh-obektov/index.html`
- `uslugi/ohrana-biznes-centrov/index.html`
- `uslugi/ohrana-torgovyh-centrov/index.html`
- `uslugi/ohrana-restoranov/index.html`
- `uslugi/ohrana-gostinic/index.html`

### Canonical collisions to review

Multiple files point to the same canonical URL for several service pages, including warehouses, parking, car dealerships, offices, stores, construction sites, business centers, shopping centers, hotels and restaurants. These may be intentional transitional files or duplicate pages; each pair should be classified before deleting or redirecting anything.

A particularly suspicious case is the canonical for `https://ohrana.tech/ohrana-ofisov/`, which was found in `css/index.html`, `ohrana-ofisov/index.html`, and `uslugi/ohrana-ofisov/index.html`. The `css/index.html` file should be inspected manually.

## Lychee link check

First run summary:

- Total references checked: 1127
- Unique URLs: 124
- Successful: 1066
- Redirected: 4
- Errors: 25
- Timeouts: 0

One error is a likely false positive: the Formspree form endpoint returns HTTP 405 to the link checker. It should not be treated as a broken user link without testing the actual form submission.

The remaining errors are mainly public `https://ohrana.tech/stati/...` URLs returning 404, including:

- `chto-delat-esli-ohrannik-ne-vyshel-na-smenu.html`
- `dokumenty-choo-do-nachala-ohrany.html`
- `dopusk-podryadchikov-kurerov-vremennyh-rabotnikov.html`
- `imeet-li-ohrannik-pravo-osmatrivat-sumki-avtomobil.html`
- `kak-bystro-dolzhna-priehat-gbr.html`
- `kak-umenshit-lozhnye-trevogi.html`
- `kak-usilit-ohranu-sklada-v-pikovyy-sezon.html`
- `kak-zashchitit-dachu-zimoy.html`
- `kogda-nuzhen-starshiy-smeny-ohrany.html`
- `kontrol-vezda-vyezda-transporta.html`
- `mozhet-li-chastnyy-ohrannik-zaderzhat-narushitelya.html`
- `nuzhna-li-trevozhnaya-knopka-esli-est-kamery.html`
- `ohrana-obekta-vo-vremya-remonta-pereezda.html`
- `ohrana-pogruzki-i-razgruzki.html`
- `ohrana-pri-otklyuchenii-elektrichestva-interneta-skud.html`
- `otvetstvennost-choo-i-sluzhby-bezopasnosti-zakazchika.html`
- `otvetstvennost-choo-za-propazhu-imushchestva.html`
- `posetitel-otkazyvaetsya-soblyudat-propusknoy-rezhim.html`
- `poteryan-propusk-klyuch-karta-dostupa.html`
- `srok-zapuska-ohrany-novogo-obekta.html`
- `usilenie-ohrany-nochyu-vyhodnye-prazdniki.html`
- `zamena-ohrannika-po-trebovaniyu-zakazchika.html`
- `zashchita-ohrannoy-signalizacii-ot-glusheniya.html`
- `zhurnaly-i-dokumenty-na-postu-ohrany.html`

## Next work

1. Classify duplicate/canonical collisions before changing URLs.
2. Check why article files exist in GitHub while their public URLs return 404.
3. Add/fix canonical on the home page if absent in the current deployed source.
4. Review H1 structure on the new `uslugi/` pages.
5. Re-run the automated audit after the next deployment.
