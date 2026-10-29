# Money, Old and New: website

The site for the Sunday letter. It's plain HTML and CSS built with Jekyll, which GitHub Pages runs for you, so there's nothing to install. The newsletter itself lives on Substack; every Subscribe button on the site points there.

**How the two fit together**

- **The site (your domain)** holds the in-depth guides, so search traffic builds on your own address.
- **Substack** sends the Sunday letter: your take, what changed this week, a few short items, and a link to the new guide.

---

## Before launch: fill in your details

Open `_config.yml` and change every line marked `CHANGE ME`:

| Setting | What to put |
|---|---|
| `url` and `baseurl` | Right now `https://slobod7.github.io` and `/money-old-and-new`. When you connect your domain, set `url` to it (for example `https://slobodzean.com`) and `baseurl` to `""` |
| `substack_url` | Your Substack address, for example `https://moneyoldandnew.substack.com` (later `https://newsletter.slobodzean.com`). While it still says `YOUR-NAME`, every Subscribe button is replaced by "Signup isn't open yet", so nobody is sent to a dead page |
| `author.photo` | Path to your portrait, for example `/assets/img/bogdan.jpg`. Upload the photo to `assets/img/` first. It appears beside the About page introduction |
| `author.outline_time`, `author.edit_rounds` | How quickly you send an outline and how many rounds of edits you include. The About page leaves the specifics out until these are filled in |
| `author.testimonial`, `author.testimonial_by` | A real one-line quote from a past editor or client, and who said it. Hidden until filled in |
| `kit.price` | The Starter Kit price, once you know it. Hidden while it contains square brackets |
| `kit.format`, `kit.licence`, `kit.refunds` | Answers to the Starter Kit questions. Each question appears once its answer is filled in |

---

## Put it on GitHub Pages

1. Create a free GitHub account if you don't have one.
2. Create a **public** repository, for example `money-old-and-new`. Free Pages hosting needs a public repository, so anyone can read the files. Keep unpublished drafts in Notion, not here.
3. Upload everything in this folder: **Add file → Upload files**, drag the folder's contents in, then **Commit changes**.
4. Go to **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
5. After a minute or two the site is live at `https://YOUR-USERNAME.github.io/money-old-and-new/`.

> On that temporary address, links will break until you connect your domain, because the site expects to live at the root of a domain. If you want to preview it there first, set `baseurl: "/money-old-and-new"` in `_config.yml`, then set it back to `""` when you add the domain.

## Connect your domain

At your domain registrar, add these DNS records (check GitHub's "Managing a custom domain" docs in case they've changed):

| Type | Name | Value |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | YOUR-USERNAME.github.io |

Then in the repository: **Settings → Pages → Custom domain**, enter your domain, save, and tick **Enforce HTTPS** once it's offered (it can take up to a day).

Also verify the domain in your GitHub account (**Settings → Pages → Add a domain**), so nobody else can point a GitHub site at it.

## Connect Substack

1. Create the publication on Substack and copy its address into `substack_url`.
2. To use your own subdomain (for example `newsletter.slobodzean.com`), go to Substack's **Settings → Domain**. Substack charges a one-time fee and shows the exact DNS record to add. At the time of writing, that's a CNAME for `newsletter` pointing to `target.substack-custom-domains.com`.
3. In Substack's theme settings, set the accent colour to `#173C32` (the site's forest green) so the signup page matches the site.
4. Turn on **Sections** in Substack if you want a separate "Starter Kit news" list for the waitlist.
5. Every Subscribe button on the site goes to `substack_url/subscribe`, Substack's own signup page. The site never collects email addresses itself.

## Google Search Console

Add your domain in Search Console and verify it with the DNS record it gives you. Then submit `https://YOUR-DOMAIN/sitemap.xml`. The sitemap, RSS feed (`/feed.xml`) and `robots.txt` are generated automatically.

---

## Design system

Quiet and well made: warm white pages, one forest green for the identity, links and buttons, and burgundy only for the keyboard focus ring and the occasional small label. No fills, gradients, shadows or textures. The full rules sit at the top of `assets/css/site.css`.

- **Type:** Besley regular for headings, guides and introductions; Archivo for navigation, dates, bylines and buttons. Guides are set at 19px (18px on phones) with a 680px reading column.
- **Grid:** on wide screens a narrow left rail holds small labels, dates and a guide's contents; everything else lines up on one column to its right. Below 960px the rail stacks above.
- **Colours:** text `#242824`, secondary text `#626960`, forest `#173C32`, burgundy `#6B2938`, background `#FAF9F6`, dividers `#DEDFD7`. Dividers are decorative only; never put forest text on burgundy or the reverse.
- **Masthead:** the full wordmark centred at 540px with Guides, About and Subscribe beneath. At 640px and below, the gateway mark replaces it at the left, with the same three links at the right. The wordmark is never shrunk or wrapped.

### Known limitation: the wordmark

`assets/brand/wordmark.svg` is the approved live-type approximation. Its lettering is set in Georgia inside the SVG, so it depends on the fonts installed on the reader's device: Georgia on macOS, iOS and Windows, a similar serif elsewhere (most Android and Linux devices). It isn't final outlined artwork. When the final lettering is chosen, replace the file with an outlined version of the same size and the site will pick it up.

---

## Publish a new guide

1. In the repository, open the `_posts` folder and click **Add file → Create new file**.
2. Name it `YYYY-MM-DD-short-address.html`, for example `2026-11-07-what-is-pump-fun.html`. The part after the date becomes the page address: `/what-is-pump-fun/`. Don't change it after publishing.
3. Start the file with this block, then write the article below it:

```
---
title: "What is Pump.fun and how does it work?"
description: "One sentence that says what the reader gets."
date: 2026-11-07 09:00:00 +0200
read_time: 8
topic: Crypto explained
start_here: true
toc:
  - id: how-it-works
    label: How it works
  - id: risks
    label: The risks
---
```

4. Commit. The guide is live within a minute or two, appears on the home page as the latest guide, and goes into the RSS feed.
5. Write the Sunday letter on Substack and link to the guide.

A post dated in the future is skipped until GitHub rebuilds the site after that date, which only happens when you push something. To publish on a set day, commit on that day.

### Building blocks you can paste into a guide

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

Every guide already ends with a subscription block, so avoid adding one early in the text. If you need one elsewhere, give it a unique `id`:

```liquid
{% include subscribe.html id="mid-title" heading="Get the next update when it lands" %}
```

Questions that open and close:

```html
<div class="faq">
<details><summary>The question?</summary><p>The answer.</p></details>
</div>
```

You can also write a guide in Markdown (name the file `.md` instead of `.html`); the building blocks above still work inside it.

### The "Old money, new money" board

Edit `_data/series.yml`. When a pair is published, add its address to `url` and it becomes a link on the home page.

---

## Where things are

| File or folder | What it controls |
|---|---|
| `_config.yml` | Site name, your details, Substack address, kit price |
| `index.html` | Home page |
| `guides/index.html` | The list of all guides |
| `_posts/` | The guides themselves |
| `about.html`, `starter-kit.html`, `subscribe.html`, `privacy.md`, `404.html` | The other pages |
| `_layouts/` | The page frames (article layout, default layout, simple page) |
| `_includes/` | Shared pieces: header, footer, the subscription block and the signup button |
| `assets/css/site.css` | All the styling. Colours, widths and fonts are at the top under `:root` |
| `assets/js/site.js` | Two small enhancements: the Copy link button and screen-reader roles for tables on phones. Pages work without it |
| `assets/fonts/` | Archivo and Besley, hosted here so visitors' browsers never contact Google |
| `assets/brand/` | The approved identity: `wordmark.svg`, `gateway.svg` and `favicon.svg`. Don't edit these by hand |
| `assets/img/guides/` | Images that belong to the guides |

## Preview on your own computer (optional)

You don't need this, because GitHub builds the site for you. If you want to preview locally, install Ruby 3, then in this folder run:

```bash
bundle install
```

```bash
bundle exec jekyll serve
```

and open `http://localhost:4000`.

## Good to know

- **Commercial use:** GitHub's rules say Pages isn't meant for sites whose main purpose is commercial transactions. A newsletter and portfolio are fine. Keep the Starter Kit checkout on Substack, Gumroad or Lemon Squeezy, not on this site. If you'd rather avoid the question entirely, Cloudflare Pages or Netlify can host this same repository.
- **No tracking:** the site has no analytics or cookies. If you add analytics later, choose a privacy-friendly one and update `privacy.md`.
