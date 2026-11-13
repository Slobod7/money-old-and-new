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
| `substack_url` | Your Substack address, for example `https://moneyoldandnew.substack.com` (later `https://letter.moneyoldandnew.com`). While it still says `YOUR-NAME`, every Subscribe button is replaced by "Signup isn't open yet", so nobody is sent to a dead page |
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
2. To use your own subdomain (for example `letter.moneyoldandnew.com`), go to Substack's **Settings → Domain**. Substack charges a one-time fee and shows the exact DNS record to add. At the time of writing, that's a CNAME for `letter` pointing to `target.substack-custom-domains.com`.
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
| Every page | The site (WebSite) and you (Person: name, photo, topics, LinkedIn and Substack). There's no job title or employer, so it matches the bio readers see |
| An article | The article (BlogPosting: title, description, image, published and updated dates, author, word count), its breadcrumb (Home › Articles › the article), and its questions (FAQPage) when it has `faq`, and the review (Review: what you reviewed, your verdict and its score) when it has `review` |
| Home | Its common questions (FAQPage), from `faq` in `index.html`'s front matter |
| About | Your profile (ProfilePage) |
| Articles | The list of articles (CollectionPage) |
| A page under `/data/` | Its breadcrumb (Home › Data › the page) |

To check a page once it's live, paste its address into Google's Rich Results Test (search.google.com/test/rich-results) or the Schema Markup Validator (validator.schema.org). Search Console's **Enhancements** section reports any errors it finds as Google crawls the site.

Google stopped showing FAQ results on 7 May 2026, for every site, so the questions won't add a dropdown under your result in Google. The markup is standard schema.org and does no harm. Whether other search engines or AI assistants use it isn't documented. Mark up each question once: if an article repeats a question from the home page, leave it out of the article's `faq`.

---

## Design system

Quiet and well made: warm white pages, one forest green for the identity (the mark, the headline, the buttons, the signup blocks, the data in charts), and a deep cordial red as the third colour, the accent. The accent is the editor's red pen: the line across the top of every page, the small label that names a list (Latest articles, Common questions, an article's contents), the series name beside an article, the underline of a link, the underline of the current page and tab, the first letter of an article, and the editor's notes on a chart (marked events, shaded episodes, the money put in). It never colours running text, a button, a large surface or a data series, and a screen should show only a little of it. The filled surfaces are the forest blocks (on the home page, the Sunday letter, with white cards, and the closing signup; on the Data page, the same block as the Sunday letter) and the pale sage block that opens the home page, with a coin drawn at its left and blocks at its right (`_includes/hero-art.html`); on phones the block's bottom edge cuts the drawings off, so the first headline stays near the top. Article covers use the same pale sage ground. No gradients, shadows or textures. The full rules sit at the top of `assets/css/site.css`.

- **Type:** Besley regular for headings, articles and introductions; Besley for buttons too; Archivo for navigation, dates and bylines. Articles are set at 19px (18px on phones) with a 680px reading column.
- **Grid:** on wide screens a narrow left rail holds small labels, dates and an article's contents; everything else lines up on one column to its right. Below 960px the rail stacks above.
- **Colours:** text `#242824`, secondary text `#626960`, forest `#173C32`, the accent `#8A2022` (a leathery cherry red, deliberately not a pinkish burgundy), background `#FAF9F6`, dividers `#DEDFD7`, pale sage `#E6EDE8` (the opening block and the ground of every drawing). On forest, the accent is too dark to see, so its light sibling `#F0A8A6` stands in, for the section label and one small mark per block. The strip behind the home calculator's inputs is `#F0F0EA`. Dividers are decorative only; never put forest text on the accent or the reverse. To try a different accent, change `--accent` (and `--accent-soft`) at the top of `assets/css/site.css`: everything follows.
- **Masthead:** the gateway mark and the site name (set in Besley) at the left, Articles, Data, About and Subscribe at the right. At 640px and below the mark and the name get a little smaller and stay together, and the four links drop to a row of their own once they no longer fit beside them.
- **Home page:** top to bottom, the slogan "Macro, through your wallet" with the Subscribe button and the writer's name, on the pale sage block; the Latest articles list (the three newest, each with its cover, hidden until the first article is published), the Sunday letter block (forest, with its illustration in `_includes/illustration-sunday-letter.svg` and three cards), the old-vs-new calculator in compartments (inputs on a tinted strip, the answer as one sentence with the amount the red marks stand for picked out and repeated in both keys, the ranking and the chart as two framed cards, the rules, the yearly-rate note and the start-month suggestions folded into "How it works" under the chart), who writes it (your photo, or your initials until `author.photo` is set), the common questions, and a closing Subscribe block in forest. The footer then opens with "Sources and notes": the calculator's disclaimer and sources, and the date the questions were checked. The header has no divider line on any page.
- **Headings and small print:** a heading stands alone, with no small label above it; the small accent label is kept only where it is the heading itself. A chart or calculator carries no disclaimer or source line of its own: those print in the page footer under "Sources and notes" (see "Small print in the footer" below).

### Known limitation: the wordmark

`assets/brand/wordmark.svg` is the approved live-type approximation. Its lettering is set in Georgia inside the SVG, so it depends on the fonts installed on the reader's device: Georgia on macOS, iOS and Windows, a similar serif elsewhere (most Android and Linux devices). It isn't final outlined artwork. The site doesn't currently use it: the header sets the name as text in Besley, which is hosted with the site and looks the same everywhere. When the final lettering is chosen, replace the file with an outlined version and swap it into `_includes/header.html`.

---

## Publish a new article

1. In the repository, open the `_posts` folder and click **Add file → Create new file**.
2. Name it `YYYY-MM-DD-short-address.html`, for example `2026-11-07-what-is-pump-fun.html`. The part after the date becomes the page address: `/articles/what-is-pump-fun/`. Don't change it after publishing.
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
cover: what-is-pump-fun
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

`cover` is the article's drawing on the site itself: beside its headline, and wherever the article is listed (the home page, Articles, "Read next"). It names a file in `_includes/covers/`, without the `.svg`. Leave it out and the article gets `covers/default.svg` (a coin, the gateway and blocks). To add one, copy an existing cover and redraw it inside the same `480 × 300` frame, using only the classes listed under "Drawings" in `assets/css/site.css` (`ink`, `solid`, `paper`, `t1` to `t3`, `mark` and so on), so it follows the palette, with the accent used for one mark. Keep it to the few things that tell the story, in the middle of the frame: in a phone's lists it is shown 120px wide, beside the summary and after the headline. Covers are decorative and hidden from screen readers; they're not the shared picture, which is still `image`.

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

Any article whose text mentions Bitcoin, crypto or stablecoins, in either case, ends with "Disclosure: I write for Bitcoin.com and own some Bitcoin." `_layouts/post.html` prints it, unless the article already says "I write for Bitcoin.com". The layout doesn't reach the RSS feed or Substack, so an article relying on the automatic line goes out without it there: add the line to the Sunday letter yourself. It also looks for those three words only, so a piece that only says "Ethereum" or "blockchain" needs its own line.

To correct an error, set `last_modified_at` and add `changed: "Corrected 6 December 2026: the deposit rate was 2.25%, not 2.50%."`. That line shows under the dateline. The "How I work" page promises readers that changes are noted on the article, so don't skip it for a correction.

4. Commit. The article is live within a minute or two, appears first in the Latest articles list on the home page, and goes into the RSS feed. The list shows its title, date and `description`.
5. Write the Sunday letter on Substack and link to the article.

To schedule a post, commit it with a future `date`. `future: false` in `_config.yml` keeps it off the site until a build after that date (GitHub Pages' own default is `future: true`, which would publish it straight away). `.github/workflows/sunday-rebuild.yml` asks Pages to rebuild every Sunday at 08:15 UTC, so date a Sunday post before then: 09:00 in Bucharest is 07:00 UTC in winter and 06:00 UTC in summer. GitHub can run scheduled workflows late, so check the post is up. For any other day, push something after the post's date or use **Actions → Sunday rebuild → Run workflow**. The file itself is public in the repository from the moment you push it, whatever its date.

### Building blocks you can paste into an article

Section heading (the `id` must match an entry in `toc`):

```html
<h2 id="how-it-works">How it works</h2>
<p>Your paragraph.</p>
```

The short-version box. Keep `id="short"`: the page then lists "The short version" first in the article's contents, and adds one line after the box that offers the Sunday letter (a link, not a button; it shows only while signup is open):

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
- The calculator values your oil on the first trading day of each month and on the latest price’s date. Those points give the chart and the "Furthest behind" note under it. A yearly return is shown only after a year or more.

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

The existing `/data/ecb-interest-rates/` page adds a reading guide, linked primary sources and `_includes/ecb-rate-changes.html`. Its “Last changes shown” summary uses the chart's `steps` and compares each rate with its preceding distinct level, independently of the other rate. It shows effective dates, never inferred announcement dates; the opening step is labelled as a chart boundary when needed. This summary stays on the last changes in the saved history while the existing chart readout selects months. Both the summary and the guide render without JavaScript.

On that page, `content_updated` records the editorial review. The line under the introduction gives the two rates in force on the latest day of the ECB's daily series (`latest` and `rates_to` in the data file), so it can be more recent than the chart, which still ends at `hicp_to`. The "Observation dates" paragraph in the sources reads the same fields, so it moves with every update and nothing on the page is typed by hand. Until 13 November 2026 that paragraph recorded a manual check (2 November 2026: every stored monthly observation and effective-date step matched the five source series). The updater now makes the daily check on every run and refuses the update if it fails.

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

`scripts/update-ecb-data.py` downloads the five series and writes `_data/ecb_rates_inflation.json` (about 12 KB). It reuses the oil script's download and file helpers and keeps its rules. It checks everything: the right series, every month present, plausible values, inflation no more than four months old, the rate change dates up to date against the ECB's daily series, and each episode against the rates. If anything fails, it stops with an error and leaves the file as it was. If nothing changed, it rewrites nothing. The file also records the two rates in force on the latest day of the daily series (`latest`, `rates_to`), so a run on a later day normally rewrites it and moves its `updated` date, even when inflation has no new month.

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
- `interpretation` (optional): `true` adds the standalone euro page’s inflation answer, year/start tables, loss/recovery dates and extended source notes. Leave it unset for the homepage.
- `compact` (optional): `true` folds the rules into a "How it works" panel under the chart.

The home page uses it after the Sunday letter block, under its own heading and introduction: `{% include old-new-calculator.html id="home-old-new" labelledby="tool-title" compact=true %}`. The introduction's inflation figures (how far prices have risen since January 1999, and what €1,000 kept in a drawer since then buys now) come from `since` in `_data/old_new.json`, so they update with the data. The rest of its wording is fixed in `index.html`. The section and its introduction span the full page width.

It also has its own page at `/data/euro-inflation-calculator/` (`data/euro-inflation-calculator.html`), with the fuller method and sources, linked from the Data page, the footer and the home page.

### End month and share link

On `/data/euro-inflation-calculator/` the reader picks an end month as well as a start, and every result follows that window: the inflation answer, balances, returns, payment counts, falls, recoveries and all three tables. Real figures are in the end month's euros. The compact calculator on the home page keeps its fixed end at the latest month and its "today's money" wording. The switch is `include.interpretation` (`cc_dates` in the include), not a config setting.

**Link to this calculation** points back to the same page with a fragment: `view`, `amount`, `mode`, `start`, `end`, `real`, `asset`, `data`, plus `benchmark` for a gold-versus-stocks link. It saves inputs, never results, and its dates are explicit, so a later data release can't extend a saved window. `data` is the data file's update date: if it differs when the link is opened, a note says the figures can differ from what was first shown. `readPreset` treats every value as untrusted and refuses the whole link if any one doesn't match; months outside the stored history show an error, and dates are never moved to the nearest available month. Links made in the local gold-versus-stocks preview still open: without that view they show every asset for the same dates, with a note saying so.

There's no chart-image download. Tests: `node tests/euro-lookup-controls.cjs`.

### Typed amounts

The euro and Brent calculators read an amount typed the English way (1,000.50) or the continental way (1.000,50 or 1000,50). A comma or point before exactly three digits groups thousands; before one or two digits at the end it is the decimal mark; anything else (1,0000 or 1,000,50) is refused with the usual message instead of guessed. Until 13 November 2026 every comma was stripped, so 1000,50 was read as 100,050. A share link still carries a plain number and is read strictly. The rule is `parseAmount()` in `assets/js/old-new-calculator.js` and `assets/js/oil-widgets.js`, kept identical; `node tests/amount-input.cjs` checks both.

### Standalone euro page interpretation

`data/euro-inflation-calculator.html` enables `interpretation=true`. The two `euro-inflation-*.html` includes hold its tables and explanatory content. All changing figures use the existing `assets/data/old-new.json`; no extra data refresh or new external browser requests are needed. January HICP observations (not annual averages) populate the €100 year table. The start comparison samples five-year starts, the selected start year and latest January. It uses a €100 lump sum and the common endpoint, marks unavailable assets, and labels unequal holding periods. Its final endpoint-price balances stay the same with the inflation toggle; its cumulative returns change.

Recovery means the first sampled month at or above the peak preceding the largest drawdown inside the selected window. It follows the underlying asset, excludes top-ups, and responds to the existing nominal/real toggle. No fixed-period best/worst-start claim is made.

Run `node tests/euro-inflation-content.cjs` for the new arithmetic, year conventions, availability and recovery cases. An optional second argument points to a pre-change calculator script for exact result regression checks. Build with `bundle exec jekyll build`; preview and check the existing `/data/euro-inflation-calculator/` route. The source-check date in the method include is editorial; the observation endpoint and data-update date continue to come from the usual updater. Costs and tax examples are hypothetical and do not alter the historical calculations.

### The home page's common questions

Ten questions near the end of the home page, in two columns ("The numbers" and "Your money"), that open and close. They come from `faq` in `index.html`'s front matter, each with a `column`. The same list feeds the FAQPage markup, so the page and the markup always match.

Some figures in the answers come from the calculator: each `[name]` in an answer, such as `[europe_2000]`, is replaced by `faq.name` in `_data/old_new.json`. The update script works those out with the calculator's data, so they move with it every month. To quote a new figure this way, add it to `faq` in `default_case()` in `scripts/update-old-new-data.py`. `_includes/faq-fill.html` does the replacing, for articles as well.

Every other figure is typed in with its month: the ECB's deposit rate, euro area, German and Romanian inflation, and the banks' deposit rates. Check them once a month, after the ECB's deposit-rate figures and the Eurostat inflation release, and change `faq_checked`, which the page shows as "Answers checked …".

The calculator lays itself out by its own width, not the screen's (a CSS container query on `.onc`). In an article column it's one column. From 860px wide, as on the home page from about 960px, the form runs in one row with every control level, and the chart sits beside the ranking and grows to the same height (on the home page it keeps its own height, with the folded rules under it).

It ranks the assets by what they'd be worth, each with a bar from €0, a tick for the money put in, its yearly return and its biggest fall. Choosing one shows its chart against the money put in, with a readout on hover, tap or drag, and with the keyboard (arrow keys, Page Up and Page Down for a year, Home and End). When the top asset is worth more than two and a half times the next, its bar is cut short with a notch, so the others stay readable. An asset with no figures for the chosen start (Bitcoin before July 2010, the bank deposit before January 2000) is listed beneath as not included. Without JavaScript, the include shows the default case (€1,000 at the end of January 2000, in today's money) as a table, worked out by the update script, with a line naming any asset whose figures start later (Bitcoin). `assets/js/old-new-calculator.js` is loaded only by pages with the calculator.

Its disclaimer carries the Bitcoin disclosure. Since 11 November 2026 the disclaimer and the source line print in the page footer, under "Sources and notes", not under the calculator (the author asked for the small print to move there). Keep the disclosure in that note.

**Small print in the footer.** Anything a page or include wraps in a pair of `<!--footnote-->` comments is lifted out of the page by `_layouts/default.html` and printed by `_includes/footer.html` under "Sources and notes", in the order it appeared. The calculators mark their disclaimers and source lines this way. Input hints, results and a chart's own caption stay where they are; so do the source lines under an article's charts. Write a footer note so it names its tool: it is read away from it.

**No small label above a heading.** A section, card or page title stands alone. The small accent label is kept only where it is the heading itself (Latest articles, Common questions, In this article, Read next).

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

## Inflation break-even interest widget

Mounted beneath the historical calculator at `/data/euro-inflation-calculator/`. This is an independent, simplified one-year scenario using assumed future inflation, a custom tax on positive interest, and an optional balance fee (zero if blank). It does not read historical data, select a country’s tax rate, compare bank offers or make external requests. Defaults (2.5% inflation, 0% tax and 0% fee) are illustrative assumptions, not observed rates.

Embedding example, using the existing site stylesheet:

```liquid
{% include inflation-break-even.html id="article-break-even" title="What gross interest rate would keep up?" %}
```

Both parameters are optional. Use a unique `id` for each instance on the same page. The include loads `assets/js/inflation-break-even.js` once; each instance updates independently. Without JavaScript, it shows a labelled worked example and the model assumptions.

For decimal inflation `i > -1`, fee `0 <= f < 1` and tax `0 <= t < 1`, the exact non-negative threshold is `max(0, (((1+i)/(1-f))-1)/(1-t))`. Interest is credited once; tax reduces positive interest, then the fee applies to the whole remaining balance. At 100% tax, zero interest is sufficient only if deflation offsets the fee (`i + f <= 0`); otherwise no finite rate works. A 100% fee is always impossible within this model. Inflation at or below −100%, tax or fees outside 0–100%, non-finite values and malformed numbers are rejected. Dot and comma decimal separators are accepted; a blank fee means zero. There are no negative gross rates or tax refunds.

The UI rounds the threshold **up** to four decimal places and works out the after-tax/fee balance change and exact inflation-adjusted change from that displayed rate. The mathematical API also returns the unrounded threshold: 2.5% inflation, 33% assumed tax and no fee requires 3.7313432835820897%; the displayed sufficient rate is 3.7314%. This 33% test is a custom assumption, not a public Irish DIRT preset. The optional country-specific example is not implemented.

Run `node tests/inflation-break-even.js`, or open `tests/inflation-break-even.html` directly in a browser. Checks cover the acceptance example, independent end-balance calculations, deflation, fee ordering, tax/fee boundaries, invalid inputs and rounding. `tests/` stays excluded from Jekyll output.

Editorial check: 2 November 2026. The public source link supports the purchasing-power concept; the calculation follows the explicitly stated model. No historical observation date or live-rate badge applies to these user assumptions.

## Investment calculator with inflation

The formula-only scenario at `/data/investment-calculator-with-inflation/` models a starting amount, fixed nominal monthly payments, horizon, annual effective gross return, annual inflation and optional balance fee. These are assumptions, not market data; there is no feed or monthly update to run. The Data card is in `_data/data_pages.yml`. Canonical metadata and the Data breadcrumb use the existing Jekyll plugins and front matter; the sitemap is the site's own `sitemap.xml`.

Reuse the interface with `{% include investment-calculator.html %}`; pass a unique `id` for multiple copies and optional `labelledby` for an external heading. The include loads two scripts only on pages that use it. No requests, cookies or storage are added.

`assets/js/investment-math.js` is the reusable, DOM-free engine: `InvestmentMath.calculate({ startingAmount, monthlyContribution, months, annualReturn, annualInflation, annualFee })`. Amounts are numeric euros; months is a whole number; rates are annual effective decimals (0.05 means 5%). Pass `annualFee: 0` for no fee. `validate()` returns field errors, and `calculate()` rejects invalid inputs or unsupported result magnitudes. It returns monthly `points`, `final`, and the factors. A separate fee-comparison widget can call this engine with different fees without using this interface.

Each month's existing balance is multiplied by `((1 + annualReturn) * (1 - annualFee)) ** (1/12)`, then the payment is added. The no-fee path uses `(1 + annualReturn) ** (1/12)` on the same schedule. Real balances divide by `(1 + annualInflation) ** (month/12)`; real contributions sum each payment discounted from its own month. Real gains always use that contribution basis. Fee drag is the difference between the fee-free and fee-adjusted balance, including compounding, not a sum of bills.

`assets/js/investment-calculator.js` handles validation, the nominal chart and the yearly table. Editing inputs hides stale results until Calculate is selected; errors link to fields, and successful submissions focus the results heading. With JavaScript off, the method remains readable and the page explains that calculation needs JavaScript. On the page, the method opens with two summary paragraphs; its detail (growth and the fee, today's purchasing power, limits, sources) sits in expanders beneath them, and a card above it leads to the euro inflation calculator.

Check the engine with `node tests/investment-calculator.cjs` (no packages needed). Cases include zero rates/amounts/payments, zero/one/long horizons, negative rates, invalid values, effective-factor conversion, fee-free comparisons, payment timing and independent per-payment nominal/real accounting. The source/method date is in the new page's front matter and visible copy; update both when the method changes.

### Fee comparison

`_includes/fee-comparison.html` runs one scenario twice, changing only the annual balance fee, and shows both final balances, the difference, optional values in today's money, a chart and a yearly table. It sits on the investment calculator's page, under the calculator, with no page or data card of its own. To embed it in an article: `{% include fee-comparison.html id="article-fees" title="Your heading" %}` (give it a unique `id`). Its styles are in `site.css`.

The maths is `InvestmentMath.compareFees()` in `assets/js/investment-math.js`, which calls the calculator's own `calculate()` once per fee, so there's no second calculator. `assets/js/fee-comparison.js` only reads the form and draws, using the chart in `assets/js/investment-calculator.js`. The opening fee levels are example inputs, not typical fund charges, so don't describe them as typical. Tests: `node tests/fee-comparison.cjs`.

## Rate-change widget

`_includes/rate-change-impact.html`, on the ECB page, has two modes. **Savings** takes a balance, two annual effective rates and an optional tax assumption, and shows the interest over one year. **Loan** takes a remaining principal, remaining term and two nominal annual rates, and compares fixed-rate monthly payments. The reader enters their own bank's rates: nothing here assumes an ECB move reaches them. It can go in an article with `{% include rate-change-impact.html id="article-rates" %}`.

The maths is `savings()` and `loan()` in `assets/js/rate-scenarios.js`, which also runs the draft's mortgage widget (`_includes/mortgage-rate-impact.html`); `loan()` uses that widget's `payment()`. The opening figures are example inputs, not current rates. Tests: `node tests/rate-change.cjs` and `node tests/rate-scenarios.cjs`.

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

Each figure is the average of the monthly shares from October 2025 to September 2026. The ECB doesn't publish every month for Luxembourg (7 of the 12), Malta (9) and Greece (11), so those are averaged over the months it has, and Bulgaria's covers January to September 2026, since it joined the euro. The chart marks all four with an asterisk.

Averaged over 2021–24 in the same way, the series gives the European Parliament study's figures (ECTI, 2025): Finland and Lithuania 97%, Estonia 94%, the Netherlands 16%, Germany 12%, Belgium 7% and France 3%.

### Updating it

The data is fixed: `_data/variable_mortgages.json`, retrieved on 10 November 2026, and nothing updates it. To redo it, download every country at once from `https://data-api.ecb.europa.eu/service/data/RAI/M..SVLHPHH.EUR.MIR.Z?format=csvdata` (add `&startPeriod=` with a recent month if the full download times out), average each country's latest 12 months, and replace `rows` (most variable first), `euro_area`, `from`, `to` and `retrieved`. Round `share_rounded` from the unrounded average, but show a share below 100 as 99, not 100. The ECB revises past months, so a redo can move earlier figures by a few tenths.

---

## Add a data page

1. Put the page in `data/`, with `permalink: /data/your-page/` in its front matter. The nav and the breadcrumb pick it up from the address.
2. Add one entry to `_data/data_pages.yml`, with `title`, `description` and `url` (`label` is no longer shown). The Data page shows the cards in that order, and needs no HTML or CSS changes.
3. Open it the way the other data pages open, so they all read as one set. Wrap the page in `<div class="wrap calc-page">`, then:
   - a `<header class="page-head">` holding the title (`page-title`), a short introduction (`page-lede`) and one line saying how recent the figures are (`meta page-vintage`: the fact in bold, a middle dot, then the update date, both read from `_data/`);
   - `{% include page-jumps.html %}` straight after it. It draws the numbered jump links from the page's front matter: `jumps` (a list of `label` and `href`, in page order) and `sources_href` (the anchor of the page's sources, shown at the right as "Sources & method").
   - End the page with its sources, after any questions.
4. If the page shows data from a file in `_data/` that has an `updated` date, name that file in the page's front matter: `dataset: brent_annual` for `_data/brent_annual.json`. The page then counts as changed whenever its data is: `_includes/page-modified.html` gives the later of `last_modified_at` and the data's date to `sitemap.xml` and to the page's markup (`dateModified`), so the monthly update moves both without anyone editing the page. Change `last_modified_at` yourself only when you change the page.
5. To link the page and the articles that use its chart, both ways and with nothing listed by hand: have the chart's include print a comment naming the page before its figure (`<!--uses:/data/your-page/-->`), and end its source caption with a link to the page when it's shown anywhere else (see `_includes/oil-chart.html`). Then put `{% include data-articles.html %}` on the page: it shows a card leading to the latest article that contains that comment, and nothing while there is none.

`sitemap.xml` at the top of the site replaces the one the jekyll-sitemap plugin would write (the plugin steps aside when the file exists). It lists the same addresses; the only difference is the date rule above.

## Where things are

| File or folder | What it controls |
|---|---|
| `_config.yml` | Site name, your details, Substack address |
| `_config.preview.yml` | Local preview only: a stand-in Substack address so the Subscribe buttons show, the sample articles in `_drafts/` (images in `assets/img/samples/`, both ignored by git), and the gold-only view. GitHub Pages ignores this file |
| `index.html` | Home page |
| `articles/index.html` | The list of all articles |
| `_posts/` | The articles themselves |
| `about.html`, `how-i-work.md`, `subscribe.html`, `privacy.md`, `404.html` | The other pages |
| `data/` | The Data page (`index.html`) and a page for each chart and calculator, at `/data/…`. Their introductions read their figures from `_data/`, so they update with the charts. Keep typed figures out of them. Each moved page keeps its old address working with `redirect_from` in its front matter |
| `_data/data_pages.yml` | The cards on the Data page (see "Add a data page") |
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

## Gold versus stocks: private local preview

The full calculator at `/data/euro-inflation-calculator/` can now show a two-asset
preset with the same engine and chart. It is gated behind `gold_stocks_preview`,
which is enabled only by `_config.gold-stocks-preview.yml`, not the production
configuration. Do not publish the preview build. No new indexed asset-pair page,
export endpoint or updater was added.

Build locally with the existing Ruby/Bundler setup:

```sh
bundle _2.4.22_ exec jekyll serve --host 127.0.0.1 --port 4007 --config _config.yml,_config.gold-stocks-preview.yml --destination /tmp/money-gold-stocks-preview
```

Choose **Gold versus stocks** in the Comparison control. Start/end months,
amount, lump sum/monthly purchases, real/nominal mode and stock benchmark are
preserved when switching views. Real figures are in the selected end month's
euros, including each contribution. Monthly buying includes both endpoint
months; the last purchase earns no return. A gap anywhere in either series
blocks the pair rather than changing dates or comparing unequal windows.
The full view still opens by default, and its original production behaviour is
unchanged when the preview setting is absent.

The share link is the public one described under "End month and share link". On
a public page a gold-versus-stocks link shows every asset for the same dates, with a note.

For an article, use the compact wrapper (it emits nothing in production):

```liquid
{% include gold-stocks-comparison.html id="article-gold-stocks" %}
```

It reuses `old-new-calculator.html` with the pair preset and folded source notes.
Use a distinct id for each instance. The chart retains arrow/Page Up/Page Down/
Home/End support. The comparison table includes balances, gain relative to
contributions, annualised returns, largest falls and first within-window
recovery of the prior high; the expandable monthly table is a chart alternative.
No JavaScript retains the stored default table, explicitly described as the
default case rather than a reconstructed share link.

Run `node tests/gold-stocks.cjs` for synthetic hand-worked endpoint, contribution,
real/nominal, drawdown/recovery, missing-data, annual-return and link cases, plus
independent unit-sum checks on the stored history. Synthetic data lives only in
`tests/`, which Jekyll excludes. Use normal production and preview builds to
verify the release gate.

## Gold-only view: local preview

`_includes/gold-return-calculator.html` is a gold-only view of the calculator, with its own form, chart and monthly table. It isn't on the public site: `data/euro-inflation-calculator.html` mounts it only when `gold_return_preview: true`, which only `_config.preview.yml` sets. It works in euros, because `assets/data/old-new.json` holds gold in euros only.

It reuses `calculate()` and the chart in `assets/js/old-new-calculator.js`. Leaving out the engine's optional `end` and `assets` gives the full comparison. Purchases and valuations use monthly-average gold prices, never month-end trades. Tests: `node tests/gold-return.cjs`.
