# Money, Old and New: website

The site for the Sunday letter. It's plain HTML and CSS built with Jekyll, which GitHub Pages runs for you, so there's nothing to install. The newsletter itself lives on Substack; every Subscribe button on the site points there.

**How the two fit together**

- **The site (your domain)** holds the in-depth articles, so search traffic builds on your own address.
- **Substack** sends the Sunday letter: a macro deep dive, a review or an opinion piece in rotation, with a link to the new article.

---

## Before launch: fill in your details

Open `_config.yml` and change every line marked `CHANGE ME`:

| Setting | What to put |
|---|---|
| `url` and `baseurl` | Already set to `https://moneyoldandnew.com` and `""`. If the domain ever changes, update `url` and the `CNAME` file together |
| `substack_url` | Your Substack address, for example `https://moneyoldandnew.substack.com` (later `https://newsletter.slobodzean.com`). While it still says `YOUR-NAME`, every Subscribe button is replaced by "Signup isn't open yet", so nobody is sent to a dead page |
| `author.photo` | Path to your portrait, for example `/assets/img/bogdan.jpg`. Upload the photo to `assets/img/` first. It appears beside the About page introduction. Use a 4:5 portrait, at least 800px wide |
| `cloudflare_analytics_token` | Optional. Your Cloudflare Web Analytics site token (see "Analytics" below). Left empty, no analytics script loads and the privacy page says there are no analytics |
| `author.avatar` | A square photo cropped close to your face, at least 320px, for the circle in "Who writes it" on the home page. Left empty, the home page uses `author.photo` |

---

## Put it on GitHub Pages

1. Create a free GitHub account if you don't have one.
2. Create a **public** repository, for example `money-old-and-new`. Free Pages hosting needs a public repository, so anyone can read the files. Keep unpublished drafts in Notion, not here.
3. Upload everything in this folder: **Add file → Upload files**, drag the folder's contents in, then **Commit changes**.
4. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
5. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/money-old-and-new/`.

> On that temporary address, links will break until you connect your domain, because the site expects to live at the root of a domain. If you want to preview it there first, set `baseurl: "/money-old-and-new"` in `_config.yml`, then set it back to `""` when you add the domain.

## Connect your domain

The site is served at `moneyoldandnew.com`. The domain is registered at Cloudflare, and its DNS (Cloudflare → **DNS → Records**) holds these records, all set to **DNS only** (grey cloud), so GitHub can issue the HTTPS certificate:

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| AAAA | @ | 2606:50c0:8000::153 |
| AAAA | @ | 2606:50c0:8001::153 |
| AAAA | @ | 2606:50c0:8002::153 |
| AAAA | @ | 2606:50c0:8003::153 |
| CNAME | www | slobod7.github.io |

The `CNAME` file in this folder tells GitHub Pages which domain to serve; **Settings → Pages → Custom domain** shows the same name, with **Enforce HTTPS** ticked. Don't delete the `CNAME` file, or the site falls back to the github.io address.

Also verify the domain in your GitHub account (**Settings → Pages → Add a domain**), so nobody else can point a GitHub site at it.

## Connect Substack

1. Create the publication on Substack and copy its address into `substack_url`.
2. To use your own subdomain (for example `newsletter.slobodzean.com`), go to Substack's **Settings → Domain**. Substack charges a one-time fee and shows the exact DNS record to add. At the time of writing, that's a CNAME for `newsletter` pointing to `target.substack-custom-domains.com`.
3. In Substack's theme settings, set the accent colour to `#173C32` (the site's forest green) so the signup page matches the site.
4. Every Subscribe button on the site goes to `substack_url/subscribe`, Substack's own signup page. The site never collects email addresses itself.

## Analytics

The site is set up for Cloudflare Web Analytics, and it's off until you add a token. Because the domain's DNS records are **DNS only**, Cloudflare can't add the script by itself, so the site does it.

1. In the Cloudflare dashboard, open **Web Analytics**, choose **Add a site** and enter `moneyoldandnew.com`.
2. Under **Manage site**, copy the token from the JS snippet into `cloudflare_analytics_token` in `_config.yml`. Check that the snippet still matches the one in `_layouts/default.html`.
3. Check the site isn't set to exclude EU visitors, or most of your readers won't be counted.
4. Push, open the site, and check that visits appear in the dashboard after a few minutes.

`privacy.md` changes by itself with the token: without one it says there are no analytics; with one it describes Cloudflare's script, with links to what Cloudflare says about it. Check that wording again if Cloudflare changes its terms, and bump "Last updated" when you change the page.

## Google Search Console

Add your domain in Search Console and verify it with the DNS record it gives you. Then submit `https://YOUR-DOMAIN/sitemap.xml`. The sitemap, RSS feed (`/feed.xml`) and `robots.txt` are generated automatically.

## Structured data (schema markup)

Every page carries schema.org markup (JSON-LD) that tells search engines what the page is and who wrote it. You don't write it: `_includes/schema.html` builds it from `_config.yml` and each page's front matter.

| Page | What it says |
|---|---|
| Every page | The site (WebSite) and you (Person: name, photo, job, employer, topics, LinkedIn and Substack) |
| An article | The article (BlogPosting: title, description, image, published and updated dates, author, word count), its breadcrumb (Home › Articles › the article), and its questions (FAQPage) when it has `faq`, and the review (Review: what you reviewed, your verdict and its score) when it has `review` |
| Home | Its common questions (FAQPage), from `faq` in `index.html`'s front matter |
| About | Your profile (ProfilePage) |
| Articles | The list of articles (CollectionPage) |

To check a page once it's live, paste its address into Google's Rich Results Test (search.google.com/test/rich-results) or the Schema Markup Validator (validator.schema.org). Search Console's **Enhancements** section reports any errors it finds as Google crawls the site.

Google stopped showing FAQ results on 7 May 2026, for every site, so the questions won't add a dropdown under your result in Google. The markup is standard schema.org and does no harm. Whether other search engines or AI assistants use it isn't documented. Mark up each question once: if an article repeats a question from the home page, leave it out of the article's `faq`.

---

## Design system

Quiet and well made: warm white pages, one forest green for the identity, links and buttons, and burgundy only for the keyboard focus ring and the occasional small label. The only filled surfaces are the two forest blocks on the home page: the Sunday letter, with white cards, and the closing signup. No gradients, shadows or textures. The full rules sit at the top of `assets/css/site.css`.

- **Type:** Besley regular for headings, articles and introductions; Besley for buttons too; Archivo for navigation, dates and bylines. Articles are set at 19px (18px on phones) with a 680px reading column.
- **Grid:** on wide screens a narrow left rail holds small labels, dates and an article's contents; everything else lines up on one column to its right. Below 960px the rail stacks above.
- **Colours:** text `#242824`, secondary text `#626960`, forest `#173C32`, burgundy `#6B2938`, background `#FAF9F6`, dividers `#DEDFD7`. Dividers are decorative only; never put forest text on burgundy or the reverse.
- **Masthead:** the gateway mark and the site name (set in Besley) at the left, Articles, Calculator, About and Subscribe at the right. At 640px and below only the mark shows, with the same four links at the right; on the narrowest phones they drop to a row of their own.
- **Home page:** top to bottom, the slogan "Macro, through your wallet" with the Subscribe button, the Latest articles list (the three newest, hidden until the first article is published), the old-vs-new calculator, the Sunday letter block (forest, with its illustration in `_includes/illustration-sunday-letter.svg` and three cards), who writes it (your photo, or your initials until `author.photo` is set), the common questions, and a closing Subscribe block in forest. The header and footer have no divider lines on any page.

### Known limitation: the wordmark

`assets/brand/wordmark.svg` is the approved live-type approximation. Its lettering is set in Georgia inside the SVG, so it depends on the fonts installed on the reader's device: Georgia on macOS, iOS and Windows, a similar serif elsewhere (most Android and Linux devices). It isn't final outlined artwork. The site doesn't currently use it: the header sets the name as text in Besley, which is hosted with the site and looks the same everywhere. When the final lettering is chosen, replace the file with an outlined version and swap it into `_includes/header.html`.

---

## Publish a new article

1. In the repository, open the `_posts` folder and click **Add file → Create new file**.
2. Name it `YYYY-MM-DD-short-address.html`, for example `2026-11-07-what-is-pump-fun.html`. The part after the date becomes the page address: `/what-is-pump-fun/`. Don't change it after publishing.
3. Start the file with this block, then write the article below it:

```
---
title: "What is Pump.fun and how does it work?"
description: "One sentence that says what the reader gets, in 155 characters or fewer."
dek: "Optional: the line under the headline, if it should say more than the description."
seo_title: "Optional: the page's title in search results"
date: 2026-11-07 09:00:00 +0200
read_time: 8
topic: The Long View
image: /assets/img/guides/what-is-pump-fun/cover.jpg
toc:
  - id: how-it-works
    label: How it works
  - id: risks
    label: The risks
faq:
  - question: "Can I lose money on Pump.fun?"
    answer: "Yes. Most tokens launched there go to zero. Answers can use **Markdown** and [links](https://example.com)."
  - question: "Is Pump.fun legal in the EU?"
    answer: "One or two short paragraphs."
---
```

Give every article its own `image`: it's the picture when the article is shared. Without one, it shares the default picture, `assets/img/og-default.png`, as a large card.

`description` is what search results and the article lists show, so keep it to 155 characters or fewer. `dek` is optional: it replaces `description` under the headline only. `seo_title` is also optional: it's the page's whole `<title>`, with nothing added, so keep it to about 60 characters. Without one, the title is the article's `title`, then a bar and the site's name. Shared links always use `title`.

`faq` is optional. Its questions appear at the end of the article under "Common questions" (change the heading with `faq_heading: "Your heading"`), with a link in the contents, and search engines get them as FAQ markup. Write questions people actually search for, and answer each one in its first sentence.

For a review, add a `review` block to the front matter. It puts a verdict box at the top of the piece (the verdict, its score, and what you reviewed) and gives search engines Review markup, which can show stars under your result:

```
review:
  verdict: Read it           # books: Read it / Skim it / Skip it. Tools and products: Use it / Try it / Skip it
  summary: "The verdict in one sentence."
  type: Book                 # Book, SoftwareApplication (apps and tools) or Product (accounts, cards, devices)
  name: "The Price of Time: The Real Story of Interest"
  by: Edward Chancellor      # the book's author, or the company behind the tool or product
  year: 2022                 # optional
  isbn: "978XXXXXXXXXX"      # optional, books only: the 13-digit ISBN of the edition you read
  url: https://example.com   # optional: the official page for the book, tool or product
  disclosure: "I bought this book myself. Links to it are not affiliate links."   # optional, shown under the verdict
```

The score comes from the verdict: Read it and Use it score 3 out of 3, Skim it and Try it 2, Skip it 1. The scores are under `review_scores` in `_config.yml`. To score one review differently, add `rating: 2` to its `review` block. Don't use `review` for a bank, broker or exchange as a company: Google ignores editorial ratings of organizations. Review a specific account or card as a `Product` instead.

Every article shows "Published" and its `date`. When you change one, add `last_modified_at: 2026-12-06` under `date`. The page then also shows "Updated 6 December 2026", and the sitemap, the feed and the structured data say it changed. jekyll-sitemap and jekyll-feed read only that field, so don't use another name. Leave `date` as it was.

4. Commit. The article is live within a minute or two, appears first in the Latest articles list on the home page, and goes into the RSS feed. The list shows its title, date and `description`.
5. Write the Sunday letter on Substack and link to the article.

To schedule a post, commit it with a future `date`. `future: false` in `_config.yml` keeps it off the site until a build after that date (GitHub Pages' own default is `future: true`, which would publish it straight away). `.github/workflows/sunday-rebuild.yml` asks Pages to rebuild every Sunday at 08:15 UTC, so date a Sunday post before then: 09:00 in Bucharest is 07:00 UTC in winter and 06:00 UTC in summer. GitHub can run scheduled workflows late, so check the post is up. For any other day, push something after the post's date or use **Actions → Sunday rebuild → Run workflow**. The file itself is public in the repository from the moment you push it, whatever its date.

### Building blocks you can paste into an article

Section heading (the `id` must match an entry in `toc`):

```html
<h2 id="how-it-works">How it works</h2>
<p>Your paragraph.</p>
```

The short-version box:

```html
<section id="short" class="short-version" aria-labelledby="short-title">
<h2 id="short-title">The short version</h2>
<ul>
<li>First point: <strong>answer</strong></li>
</ul>
</section>
```

A ledger entry ("why it's here" and "the catch"):

```html
<div class="t-account">
<div class="t-why"><h4>Why it’s here</h4><p>…</p></div>
<div class="t-catch"><h4>The catch</h4><p>…</p></div>
</div>
```

An image with a source credit (put the file in `assets/img/guides/`):

```html
<figure class="figure">
<img src="{{ '/assets/img/guides/your-image.jpg' | relative_url }}" width="1400" height="700" alt="Describe what the image shows" loading="lazy">
<figcaption>What it shows. Source: example.com</figcaption>
</figure>
```

A table that turns into labelled blocks on phones (give every cell except the first a `data-label`):

```html
<div class="table-wrap" role="region" aria-label="What the table compares" tabindex="0">
<table class="data stack">
<thead><tr><th scope="col">Name</th><th scope="col">Best for</th></tr></thead>
<tbody>
<tr><th scope="row">Bitcoin</th><td data-label="Best for">Holding</td></tr>
</tbody>
</table>
</div>
```

Every article already ends with a subscription block, so avoid adding one early in the text. If you need one elsewhere, give it a unique `id`:

```liquid
{% include subscribe.html id="mid-title" heading="Get the next update when it lands" %}
```

For questions that open and close, use `faq` in the front matter (above) rather than writing the HTML by hand. Only the front matter version gets FAQ markup.

You can also write an article in Markdown (name the file `.md` instead of `.html`); the building blocks above still work inside it.

---

## Oil widgets

Two widgets for articles about oil: a chart of the Brent crude price, and a calculator that answers "if I had put money into oil from year X, what would I have today?". Paste either line into an article where you want it. Only pages with a widget load its script (`assets/js/oil-widgets.js`), and it reads its data from this site alone: no outside requests, cookies or storage, so the privacy page stays true.

### The Brent chart

```liquid
{% include oil-chart.html id="brent-since-1990" %}
```

- `id`: a name for this chart, different for each chart on the page. You can put several charts in one article.
- `title` (optional): a heading above the chart, for example `title="Brent since 1990"`.
- `range` (optional): the view it opens on: `1y`, `5y`, `10y`, `20y` or `all` (since 1990, the default).

Readers can switch the range and choose "Price at the time" or "In today’s dollars". Hovering, tapping or dragging shows the date and price; the chart can also be read with the keyboard (arrow keys, Page Up and Page Down for a year, Home and End). Under it, "Show the data" opens a table of yearly averages. Without JavaScript, the chart is a plain line of those yearly averages and the table still works.

The six annotations are set in `assets/js/oil-widgets.js` (`EVENTS`). Their prices and dates aren't typed in by hand: the update script finds them in EIA's daily data (`EVENTS` in `scripts/update-oil-data.py`) and writes them into the data file.

### The oil calculator

```liquid
{% include oil-calculator.html %}
```

- `title` (optional): replaces the heading "What if you had bought oil?".
- `id` (optional): only needed for a second calculator on the same page.

It starts at $1,000 in January 2000 (or $100 a month for monthly buying). Without JavaScript, it shows that case worked out in advance, with the rules and the note on what the spot price means.

### Where the data comes from

| Data | Source | Used for |
|---|---|---|
| Europe Brent spot price FOB, dollars a barrel | EIA series RBRTE: daily, monthly and yearly spreadsheets (no key needed) | Everything |
| US consumer prices | FRED series CPIAUCSL (seasonally adjusted) | "In today’s dollars" and the calculator’s inflation option in dollars |
| Euro area consumer prices | ECB Data Portal, HICP overall index, euro area, changing composition (`HICP.M.U2.N.000000.4D0.INX`, 2025 = 100) | The inflation option in euros |
| US dollars per euro | ECB reference rate (`EXR.D.USD.EUR.SP00.A`), from 4 January 1999 | The calculator in euros |

`scripts/update-oil-data.py` downloads these and writes two files:

- `assets/data/oil.json` (about 33 KB, 11 KB as sent): monthly rows since January 1990 (EIA’s average, the first trading day and its price, CPI, HICP and the euro rate that day), daily prices for the last two years, yearly averages, the annotation figures, and the dates the data runs to.
- `_data/brent_annual.json` (about 1 KB): the yearly averages, already formatted, for the table and the no-JavaScript chart, plus the calculator’s default case.

The script checks everything it downloads (the right series, dates in order, prices that make sense, nothing stale). If anything fails, it stops with an error and leaves both files as they were. If nothing changed, it rewrites nothing. "Updated" under each widget is the day the script last found new data.

**How these figures are defined** (agreed on 30 October 2026):

- Monthly and yearly averages are EIA’s own. The current month and year, which EIA hasn’t averaged yet, are the average of its daily prices so far, marked "so far".
- "First trading day" is the first day of the month with an EIA price. In 14 months since 1990, all before 2006, EIA’s daily series has no price until after the 4th (for example 11 May 1998), and the purchase happens on that first priced day.
- Euro purchases use the ECB rate for that day, or the ECB’s last rate before it on days it published none (mostly 1 May). The value today converts back at the rate for the date of the latest Brent price.
- "Today’s dollars" multiplies a price by the latest CPI over the CPI of its month; a yearly average uses the average CPI of the year’s months. Months after the latest CPI count as today’s money. US CPI for October 2025 was never published (the federal shutdown), so it’s taken as the geometric midpoint of September and November 2025 (324.654). The script fills only a single missing month like that one and stops on any longer gap.
- The calculator values your oil on the first trading day of each month and on the latest price’s date. Those points give the chart and the worst moment. A yearly return is shown only after a year or more.

### How the data stays up to date

`.github/workflows/update-oil-data.yml` runs the script at 06:30 UTC on the 18th of each month, after the month’s US CPI comes out, and commits the two files only if they changed. If a download fails, the run fails, GitHub emails you, and the site keeps the old data.

A push made with the workflow’s own token (`GITHUB_TOKEN`) does **not** start a GitHub Pages build. GitHub’s documentation says so in as many words ("Commits pushed by a GitHub Actions workflow that uses the GITHUB_TOKEN do not trigger a GitHub Pages build"). So after committing, the workflow asks Pages to rebuild through GitHub’s API, which its `pages: write` permission allows. This hasn’t run yet: after the first run, check **Actions** for a "pages build and deployment" run straight after "Update oil data". If it isn’t there, the fallback is a personal access token saved as a repository secret.

GitHub turns off scheduled workflows in a public repository after 60 days with no activity. If that happens, **Actions → Update oil data → Enable workflow** turns it back on.

### Update the data by hand

From this folder, with the Python that comes with macOS (nothing to install):

```bash
python3 scripts/update-oil-data.py
```

It prints what it wrote, or "No change". Then commit `assets/data/oil.json` and `_data/brent_annual.json`. You can also run the workflow from **Actions → Update oil data → Run workflow**.

### Check the calculator’s maths

Open `tests/oil-calculator.html` in a browser (double-click it). It runs the calculator on three cases worked out by hand from the raw EIA, ECB and FRED data (a lump sum in dollars, monthly buying in dollars and a lump sum in euros) and says "All 45 checks passed" or lists what failed. It uses `tests/oil-fixture.js`, a frozen copy of the data, so its answers don’t move when the data updates. Jekyll doesn’t publish `tests/` or `scripts/`.

### The fund example in the calculator’s note

The calculator’s note says funds that track oil futures earned far less than the spot price, and backs it up with one checked example (approved 30 October 2026):

> USO, a US fund that holds oil futures, shows the gap. From its launch on 10 April 2006 to the end of 2025, its value per share fell 87%. The spot price of WTI, the US crude it tracks, fell 16%.

The figures, all checked:

| | 10 April 2006 | 31 December 2025 | Change |
|---|---|---|---|
| USO net asset value per share | $67.39, or $539.12 after the 1-for-8 reverse split of 28 April 2020 | $69.10 | −87.2% ($1,000 → $128) |
| WTI spot, Cushing (EIA series RWTC) | $68.29 | $57.26 | −16.1% ($1,000 → $838) |
| Brent spot (EIA series RBRTE; no price on 10 April, so 6 April) | $67.58 | $61.35 | −9.2% |

Sources: USO’s annual reports on Form 10-K at SEC EDGAR. The [2006 report](https://www.sec.gov/Archives/edgar/data/1327068/000100371507000116/unitedstatesoilfundlp10k2006.htm) gives the starting net asset value ($67.39), the [2020 report](https://www.sec.gov/Archives/edgar/data/1327068/000110465921029202/uso-20201231x10k.htm) the reverse split, and the [2025 report](https://www.sec.gov/Archives/edgar/data/1327068/000110465926021501/uso-20251231x10k.htm) the year-end value ($69.10), adding that USO "has not previously made any cash distributions". So the change in value per share is the whole return. Spot prices come from EIA. Net asset value is used rather than the market price; the two were within 0.1% at the end of 2025 ($69.10 and $69.16). Most of the gap comes from rolling futures in contango: selling the expiring contract and buying a dearer later one. Interest on the fund’s cash and its fees also play a part. The comparison is with WTI because that’s what USO holds; Brent did a little better, but the gap is the same story.

These figures are fixed history, so the update script never changes them. To reword the example, edit the note in `_includes/oil-calculator.html`.

---

## ECB rates chart

Euro area inflation against the ECB's interest rates, month by month since January 2007, with each time the ECB raised rates into an energy shock shaded from its first hike to its first cut. Paste this line where you want it:

```liquid
{% include ecb-rates-chart.html id="ecb-rates" title="ECB rates and euro area inflation since 2007" %}
```

- `id`: a name for this chart, different for each chart on the page.
- `title` (optional): a heading above the chart.

It has two panels on one time scale: inflation (headline and core) on top, the ECB's main refinancing rate and deposit rate beneath, as step lines. A percentage point is the same height in both panels, so a rate and inflation can be compared across them. Jekyll draws the whole chart as inline SVG, so it reads the same without JavaScript, and "Show the data" opens a table of every month, newest first. `assets/js/ecb-chart.js`, loaded only by pages with the chart, adds a readout of the month's four figures on hover, tap or drag, and with the keyboard (arrow keys, Page Up and Page Down for a year, Home and End). It reads the figures from the chart's own table: no requests, cookies or storage.

Both rates are there because the ECB article quotes the main rate for 2008 and 2011 (4.25% and 1.50% at the peaks) and the deposit rate for 2022–26 (4.00% and 2.50%): the ECB steered with the first then and steers with the second now.

### Where the data comes from

| Data | ECB Data Portal series |
|---|---|
| Euro area inflation (HICP, all items), annual rate of change | `HICP.M.U2.N.000000.4D0.ANR` |
| Core inflation: HICP excluding energy, food, alcohol and tobacco | `HICP.M.U2.N.XEF000.4D0.ANR` |
| Deposit facility rate | `FM.B.U2.EUR.4F.KR.DFR.LEV` |
| Main refinancing rate: minimum bid rate of the variable rate tenders, 28 June 2000 to 14 October 2008 | `FM.B.U2.EUR.4F.KR.MRR_MBR.LEV` |
| Main refinancing rate: fixed rate, from 15 October 2008 | `FM.B.U2.EUR.4F.KR.MRR_FR.LEV` |

Inflation is Eurostat's, for the euro area in its changing composition: the same basis as the HICP index the oil calculator uses. The rate series list the day each change took effect, usually six days after the decision, and the step lines change on that day; the shading starts and ends on the day of the decision. The table gives the rates in force at the end of each month. The main rate is joined from its two series on 15 October 2008, when the ECB went back to fixed rate tenders.

The episodes are set in `EPISODES` at the top of `scripts/update-ecb-data.py`, as the dates of the decision on the first hike and on the first cut: 3 July to 8 October 2008, 7 April to 3 November 2011, 21 July 2022 to 6 June 2024, and 11 June 2026, still open.

### How it stays up to date

`scripts/update-ecb-data.py` downloads the five series and writes `_data/ecb_rates_inflation.json` (about 12 KB). It reuses the oil script's download and file helpers and keeps its rules. It checks everything: the right series, every month present, plausible values, inflation no more than four months old, the rate change dates up to date against the ECB's daily series, and each episode against the rates. If anything fails, it stops with an error and leaves the file as it was. If nothing changed, it rewrites nothing.

When the ECB first cuts after 11 June 2026, the script stops and asks for the date of that decision. Add it as the end of the last entry in `EPISODES`, run the script again and commit.

The monthly workflow (**Actions → Update oil data**, on the 18th) runs it after the oil script. If one of the two fails, the other's update is still committed, and the run shows as failed so GitHub emails you. To update by hand, from this folder:

```bash
python3 scripts/update-ecb-data.py
```

It prints what it wrote, or "No change". Then commit `_data/ecb_rates_inflation.json`.

## Old-vs-new calculator

What euros put into cash at home, a bank deposit, German bonds, gold, US stocks, European stocks or Bitcoin would be worth today, as a lump sum or every month from any month since January 1999, in today's money or not. Paste this line where you want it:

```liquid
{% include old-new-calculator.html %}
```

- `id` (optional): needed only for a second calculator on the same page.
- `title` (optional): replaces the heading.
- `labelledby` (optional): the id of a heading outside the include that names the calculator. The include then drops its own heading.
- `compact` (optional): `true` folds the rules and sources into a "How it works, and sources" panel under the honesty note.

The home page uses it between Latest articles and the Sunday letter block, under its own heading and introduction: `{% include old-new-calculator.html id="home-old-new" labelledby="tool-title" compact=true %}`. The introduction's inflation figures (how far prices have risen since January 1999, and what €1,000 kept in a drawer since then buys now) come from `since` in `_data/old_new.json`, so they update with the data. The rest of its wording is fixed in `index.html`. The section and its introduction span the full page width.

It also has its own page at `/euro-inflation-calculator/` (`euro-inflation-calculator.html`), with the rules and sources showing, linked from the nav, the footer and the home page.

### The home page's common questions

Ten questions near the end of the home page, in two columns ("The numbers" and "Your money"), that open and close. They come from `faq` in `index.html`'s front matter, each with a `column`. The same list feeds the FAQPage markup, so the page and the markup always match.

Some figures in the answers come from the calculator: each `[name]` in an answer, such as `[europe_2000]`, is replaced by `faq.name` in `_data/old_new.json`. The update script works those out with the calculator's data, so they move with it every month. To quote a new figure this way, add it to `faq` in `default_case()` in `scripts/update-old-new-data.py`. `_includes/faq-fill.html` does the replacing, for articles as well.

Every other figure is typed in with its month: the ECB's deposit rate, euro area, German and Romanian inflation, and the banks' deposit rates. Check them once a month, after the ECB's deposit-rate figures and the Eurostat inflation release, and change `faq_checked`, which the page shows as "Answers checked …".

The calculator lays itself out by its own width, not the screen's (a CSS container query on `.onc`). In an article column it's one column. From 860px wide, as on the home page from about 960px, the form runs in one row with every control level, the chart sits beside the ranking and grows to the same height, and the honesty note sits beside the rules.

It ranks the assets by what they'd be worth, each with a bar from €0, a tick for the money put in, its yearly return and its biggest fall. Choosing one shows its chart against the money put in, with a readout on hover, tap or drag, and with the keyboard (arrow keys, Page Up and Page Down for a year, Home and End). When the top asset is worth more than two and a half times the next, its bar is cut short with a notch, so the others stay readable. An asset with no figures for the chosen start (Bitcoin before July 2010, the bank deposit before January 2000) is listed beneath as not included. Without JavaScript, the include shows the default case (€1,000 at the end of January 2000, in today's money) as a table, worked out by the update script, with a line naming any asset whose figures start later (Bitcoin). `assets/js/old-new-calculator.js` is loaded only by pages with the calculator.

The honesty note under it carries the Bitcoin disclosure. Keep it there.

### Where the data comes from

| Asset | Source |
|---|---|
| Bank deposit | ECB, households' deposits with agreed maturity of up to one year, new business: `MIR.M.U2.B.L22.F.R.A.2250.EUR.N`, compounded monthly |
| German bonds | ECB, Germany's 10-year yield: `IRS.M.DE.L.L40.CI.0000.EUR.N.Z`. Each month a new 10-year bond bought at par is valued at the next month's yield, then swapped for a new one |
| Gold | World Bank Pink Sheet, monthly average in dollars a troy ounce. The file's address changes with each release, so the script finds it through the link on the Commodity Markets page |
| US stocks, European stocks | Kenneth French's Data Library: market excess return plus the one-month T-bill rate, in dollars, dividends included |
| Bitcoin | Coin Metrics Community API, `PriceUSD`, daily, from July 2010 |
| Euros and inflation | ECB euro reference rates (the last of each month; gold uses the monthly average) and euro area HICP, as in the oil calculator |

Every value is at the end of its month, except gold's. Before launch, check the terms: Coin Metrics' Community data appears to be free for non-commercial use only (for anything else they ask you to contact info@coinmetrics.io), which matters if the site carries sponsored posts. Kenneth French's library and the World Bank's data ask for credit, which the source line gives.

### How it stays up to date

`scripts/update-old-new-data.py` writes `assets/data/old-new.json` (about 27 KB: each asset's value in euros at the end of every month since January 1999, and HICP) and `_data/old_new.json` (the default case for the page without JavaScript, and the figures the home page's questions quote). It reuses the oil script's download and file helpers and keeps its rules: if a download fails or looks wrong, it stops with an error and leaves both files as they were, and if nothing changed, it rewrites nothing. It runs to the latest month every source has; the deposit rate may lag by up to two months, carried forward from its latest month, and the page says so.

The monthly workflow runs it after the oil and ECB scripts. To update by hand, from this folder:

```bash
python3 scripts/update-old-new-data.py
```

Then commit `assets/data/old-new.json` and `_data/old_new.json`.

## Variable-rate mortgage chart

Horizontal bars: the share of new mortgages on a variable rate in each euro area country, most variable first, with the euro area beneath. Plain HTML and CSS, no script.

```liquid
{% include variable-mortgages-chart.html title="New mortgages on a variable rate" %}
```

- `title` (optional): a heading above the chart, set as a level-4 heading because the chart sits under an h3 in the ECB article.
- `id` (optional): only needed for a second copy on the same page.

The countries listed under `marked` in the data file (Finland and France, the two the ECB article contrasts) are drawn in forest with their names in bold; the rest are muted. "Show the data" opens a table with one decimal and the number of months behind each figure.

### Where the data comes from

ECB Data Portal series `RAI.M.{country}.SVLHPHH.EUR.MIR.Z`, one of the ECB's risk assessment indicators: new loans to households for house purchase with a floating rate or a rate fixed for up to one year, as a share of all new loans for house purchase. The ECB builds it from its MFI interest rate statistics (MIR); for the euro area it equals `MIR.M.U2.B.A2C.F.B.A.2250.EUR.N` divided by `MIR.M.U2.B.A2C.A.B.A.2250.EUR.N`. MIR publishes the split by rate fixation only for the euro area as a whole, which is why the country figures come from this indicator.

Each figure is the average of the monthly shares from September 2025 to August 2026. The ECB doesn't publish every month for Luxembourg (6 of the 12), Malta (9) and Greece (11), so those are averaged over the months it has, and Bulgaria's covers January to August 2026, since it joined the euro. The chart marks all four with an asterisk.

Averaged over 2021–24 in the same way, the series gives the European Parliament study's figures (ECTI, 2025): Finland and Lithuania 97%, Estonia 94%, the Netherlands 16%, Germany 12%, Belgium 7% and France 3%.

### Updating it

The data is fixed: `_data/variable_mortgages.json`, retrieved on 30 October 2026, and nothing updates it. To redo it, download every country at once from `https://data-api.ecb.europa.eu/service/data/RAI/M..SVLHPHH.EUR.MIR.Z?format=csvdata`, average each country's latest 12 months, and replace `rows` (most variable first), `euro_area`, `from`, `to` and `retrieved`.

---

## Where things are

| File or folder | What it controls |
|---|---|
| `_config.yml` | Site name, your details, Substack address |
| `_config.preview.yml` | Local preview only: a stand-in Substack address so the Subscribe buttons show, and the sample articles in `_drafts/` (images in `assets/img/samples/`, both ignored by git). GitHub Pages ignores this file |
| `index.html` | Home page |
| `articles/index.html` | The list of all articles |
| `_posts/` | The articles themselves |
| `euro-inflation-calculator.html`, `about.html`, `subscribe.html`, `privacy.md`, `404.html` | The other pages |
| `_layouts/` | The page frames (article layout, default layout, simple page) |
| `_includes/` | Shared pieces: header, footer, the subscription block and the signup button |
| `assets/css/site.css` | All the styling. Colours, widths and fonts are at the top under `:root` |
| `assets/js/site.js` | Two small enhancements: the Copy link button and screen-reader roles for tables on phones. Pages work without it |
| `assets/js/oil-widgets.js` | The oil chart and calculator (see "Oil widgets"). Loaded only by pages that use them |
| `assets/data/oil.json`, `_data/brent_annual.json` | The oil widgets' data, written by `scripts/update-oil-data.py`. Don't edit by hand |
| `assets/js/ecb-chart.js` | The ECB chart's readout (see "ECB rates chart"). Loaded only by pages that use it; the chart works without it |
| `_data/ecb_rates_inflation.json` | The ECB chart's data, written by `scripts/update-ecb-data.py`. Don't edit by hand |
| `assets/js/old-new-calculator.js` | The old-vs-new calculator (see "Old-vs-new calculator"). Loaded only by pages that use it |
| `assets/data/old-new.json`, `_data/old_new.json` | The old-vs-new calculator's data, written by `scripts/update-old-new-data.py`. Don't edit by hand |
| `_data/variable_mortgages.json` | The variable-rate mortgage chart's data, fixed (see "Variable-rate mortgage chart") |
| `scripts/`, `tests/` | The data update scripts and the oil calculator's maths test. Not published |
| `.github/workflows/` | The monthly update of the oil, ECB and old-vs-new data, and the Sunday rebuild that publishes scheduled posts |
| `assets/fonts/` | Archivo and Besley, hosted here so visitors' browsers never contact Google |
| `assets/brand/` | The approved identity: `wordmark.svg`, `gateway.svg` and `favicon.svg`. Don't edit these by hand |
| `assets/img/guides/` | Images that belong to the articles |
| `assets/img/og-default.png` | The picture shared links show for any page without its own `image` (1200×630) |

## Preview on your own computer (optional)

You don't need this, because GitHub builds the site for you. On a Mac, the built-in Ruby is enough. Once, install Bundler and the site's gems (they go into your home folder, not this one):

```bash
gem install --user-install bundler -v 2.4.22
```

```bash
~/.gem/ruby/2.6.0/bin/bundle _2.4.22_ config set --local path ~/.gem/money-old-and-new-site/bundle
```

```bash
~/.gem/ruby/2.6.0/bin/bundle _2.4.22_ install
```

Then, each time you want to preview, run this in this folder:

```bash
~/.gem/ruby/2.6.0/bin/bundle _2.4.22_ exec jekyll serve --config _config.yml,_config.preview.yml --destination ~/Library/Caches/money-old-and-new-site/_site
```

and open `http://localhost:4000`. The built pages go to `~/Library/Caches`, so nothing extra appears in this folder.

## Good to know

- **Commercial use:** GitHub's rules say Pages isn't meant for sites whose main purpose is commercial transactions. A newsletter and portfolio are fine. If you ever sell something, keep the checkout on Substack, Gumroad or Lemon Squeezy, not on this site. If you'd rather avoid the question entirely, Cloudflare Pages or Netlify can host this same repository.
- **No tracking cookies:** the site sets no cookies. The only analytics option is Cloudflare Web Analytics (see "Analytics"), off until you add its token.
