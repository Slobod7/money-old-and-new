---
layout: page
title: Privacy
description: What this site collects, and who handles your email if you subscribe (Substack).
permalink: /privacy/
---

{% if site.cloudflare_analytics_token and site.cloudflare_analytics_token != "" -%}
**This site counts visits with Cloudflare Web Analytics, and collects nothing else about you.** There are no ads, no tracking cookies and no contact forms. The fonts are hosted here, so your browser doesn’t contact Google to load them.

**How the count works.** Each page loads a small script from Cloudflare, and your browser sends Cloudflare a report on how the page loaded. I see totals, such as visits and page views. [Cloudflare says](https://www.cloudflare.com/web-analytics/) the script uses no cookies or local storage, and that it doesn’t fingerprint people by their IP address or browser details to produce these figures. [Its documentation says](https://developers.cloudflare.com/web-analytics/about/) it doesn’t collect or use visitors’ personal data. Your browser still connects to Cloudflare’s servers to do this, so they receive your IP address with the request; [Cloudflare says](https://blog.cloudflare.com/the-rum-diaries-enabling-web-analytics-by-default/) it removes IP addresses when it processes these reports. See [Cloudflare’s privacy policy](https://www.cloudflare.com/privacypolicy/).
{%- else -%}
**This site doesn’t collect anything about you.** There are no analytics, no ads, no tracking cookies and no contact forms. The fonts are hosted here, so your browser doesn’t contact Google to load them.
{%- endif %}

**The site is hosted on GitHub Pages.** Like any web host, GitHub may keep basic server logs, such as IP addresses, to keep the service running and secure. See [GitHub’s privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

**The newsletter is sent by Substack.** Signup happens on Substack’s own signup page, so you enter your email address there, not on this site. If you subscribe, Substack stores your address and sends the Sunday letter. See [Substack’s privacy policy](https://substack.com/privacy). You can unsubscribe with one click at the bottom of any letter.

**Questions?** Email [{{ site.author.email }}](mailto:{{ site.author.email }}).

*Last updated: 2 November 2026*
