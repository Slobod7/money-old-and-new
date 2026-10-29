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
| `substack_url` | Your Substack address, for example `https://moneyoldandnew.substack.com` (later `https://newsletter.slobodzean.com`) |
| `author.photo` | Path to your portrait, for example `/assets/img/bogdan.jpg`. Upload the photo to `assets/img/` first |
| `kit.price` | The Starter Kit price, once you know it |

Then search the site for square brackets and replace the placeholders:

- `about.html`: `[X working days]`, `[number] round(s)` and the client quote
- `starter-kit.html`: format, licence and refund policy
- `privacy.md`: the date you publish

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
3. In Substack's theme settings, set the accent colour to `#23285E` (the site's indigo) so the signup form on `/subscribe/` matches the site.
4. Turn on **Sections** in Substack if you want a separate "Starter Kit news" list for the waitlist.

## Google Search Console

Add your domain in Search Console and verify it with the DNS record it gives you. Then submit `https://YOUR-DOMAIN/sitemap.xml`. The sitemap, RSS feed (`/feed.xml`) and `robots.txt` are generated automatically.

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

A subscribe box in the middle of an article:

```liquid
{% include subscribe-window.html heading="Get the next update when it lands" class="inline" %}
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
| `_layouts/` | The page frames (article layout, default layout) |
| `_includes/` | Shared pieces: header, footer, subscribe box, the rosette |
| `assets/css/site.css` | All the styling. Colours are at the top under `:root` |
| `assets/fonts/` | Archivo and Besley, hosted here so visitors' browsers never contact Google |
| `assets/img/` | The logo mark, wavy line, portrait frame, cheque band and guide images |

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
