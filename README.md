# Putnam Trainer

A local, browser-based tool for training on Putnam-style problems.

## Why I made it

As someone who didn't do olympiad/proof math before, it became increasingly difficult to find resources that could bridge the gap between my AIME base to Putnam. This is my personal attempt at bridging the gap.

## Running it

Clone the repo and open `index.html` directly in your browser. Progress is saved to `localStorage`, so
open the file directly rather than through a dev server, or you'll end up with two separate histories.
Use the Export button on the dashboard to back up progress.

There's no content in this repo yet. It ships as an empty framework so you can build it out around
whatever you're actually studying.

## How it works

- Topics follow the table of contents of *Putnam and Beyond*, tracked in `topics.md`.
- A problem's difficulty starts from its contest position (Putnam A1 vs B5, AIME #1 vs #15) and adjusts
  based on your own solve history over time.
- Hints are free. They never cost XP or break a streak.

## Adding content

Problems come from real, verifiable contest archives (Kedlaya's Putnam archive, AIME sources), never
written from memory. `build-instructions.md` has the sourcing rules and `CLAUDE.md` has the build
workflow, both meant to be edited to fit what you're studying.

## Testing

```
node test.js
```

Checks the rating logic, content rules, and persistence. Run before every commit.

## Layout

```
index.html      app shell, one <script> line per content unit
style.css
js/rating.js    rating model, outcome scale, XP, mastery
js/state.js     persistence, unit registry, the single attempt-recording path
js/session.js   which problems to serve
js/app.js       views and event handling
content/        one file per unit (empty until you build one)
vendor/katex/   vendored so math renders offline
topics.md       roadmap and status
build-instructions.md   how a topic becomes a unit
```

## License

App code is MIT licensed, see `LICENSE`. Contest problems you add yourself keep their original
copyright; vendored KaTeX keeps its own license (`vendor/katex/LICENSE`).
