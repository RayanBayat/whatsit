# Whatsit Privacy Policy

*Last updated: 2026-06-10*

Whatsit explains text you select on web pages. Here is everything it does
with data, in full:

## What Whatsit processes

When you select text and choose **What's this?**, the extension reads:

- the text you selected,
- up to ~600 characters of surrounding text from the same paragraph,
- the page title.

This is sent to the AI model **running inside your browser on your own device**
to generate the explanation shown in the popup:

- **Chrome:** Google's Gemini Nano, via Chrome's built-in Prompt API.
- **Firefox:** the Firefox AI Runtime, via the built-in WebExtensions ML API.

In both cases the text you select is processed locally and is never sent over
the network by Whatsit.

## What Whatsit collects, stores, or transmits

**Nothing.**

- No data ever leaves your device. The extension makes zero network requests.
- Nothing is stored — no history, no logs, no cookies, no local storage.
- There are no accounts, no analytics, no trackers, and no third-party
  services.
- The extension only accesses a page when you explicitly invoke it there
  (`activeTab`); it has no standing access to any website.

The one-time, first-use model download is performed **by your browser**, not by
Whatsit, and contains no information about you or what you read.

## Changes

If a future version ever changes any of the above, this policy will be
updated first and the change will be clearly disclosed in the extension's
listing.

## Contact

Questions: open an issue on the project repository.
