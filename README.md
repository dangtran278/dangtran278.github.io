# dangtran278.github.io

Personal site of Dang Quang Thien Tran: https://dangtran278.github.io. It looks like a VS Code window,
with each section shown as a file, and it has a small chatbot, ChatHallulu, that answers questions about
me.

GitHub Pages builds it with Jekyll. The data files and the publication and news collections come from
[academic-homepage](https://github.com/luost26/academic-homepage) by Shitong Luo (MIT license).

## Editing content

| To change | Edit |
| --- | --- |
| Name, links, bio, education, honors, skills | `_data/profile.yml` |
| Research, experience, projects | `_data/research.yml`, `experience.yml`, `projects.yml` |
| Publications, news | one file per item in `_publications/`, `_news/` |
| Figures | `cover:` in a paper or project entry, images in `assets/images/figures/` (16:10) |
| Photo, CV and resume | `assets/images/photos/dang.jpg`, `assets/files/` |
| What ChatHallulu says beyond the page | `_data/chathallulu.yml` |

ChatHallulu reads the same data files as the page, so new entries need no bot edit. The bio and research
notes in `_data/chathallulu.yml` are copies, though: update them when your own bio or research changes.

## Preview locally

```sh
docker run --rm -it -v "$PWD:/srv/site" -w /srv/site -p 4000:4000 ruby:3.1 \
  sh -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

Then open http://localhost:4000.

## ChatHallulu

Open it with the button in the title bar or Ctrl+Alt+I. It runs
[Qwen3.5-0.8B](https://huggingface.co/onnx-community/Qwen3.5-0.8B-Text-ONNX) entirely in your browser with
[transformers.js](https://github.com/huggingface/transformers.js) on WebGPU, after asking to download about
520 MB. Nothing you type leaves the page. It works on desktop Chrome and Edge, not on phones.

For a question about me, it finds the three most relevant passages on the site, answers from them, and
checks each sentence against them. Search uses BM25 and
[granite-embedding-small-english-r2](https://huggingface.co/ibm-granite/granite-embedding-small-english-r2)
(IBM, Apache 2.0). It also chats about anything else, and labels answers that don't come from the site.

### Tests

`tools/chathallulu/cases.txt` lists questions and what their answers should contain. With the site
running locally:

```sh
cd tools/chathallulu
npm install       # once
node route.js     # instant: does each question go to the right place?
node ask.js       # a few minutes: asks every question in the real chat
```

`ask.js` drives an installed Google Chrome. To use Edge instead, set `BROWSER=msedge` first.

## Terminal

`` Ctrl+` `` (or Terminal in the status bar) opens a terminal at the bottom. Its commands include: `ls`, `open research`, `grep attention` (the same keyword search ChatHallulu
uses), `resume`, `cv`, `contact` and `bibtex`. Type `help` for the list.

## Credits

- Site structure: [academic-homepage](https://github.com/luost26/academic-homepage) by Shitong Luo, MIT.
- `assets/chathallulu/porter2.js`: [wink-porter2-stemmer](https://github.com/winkjs/wink-porter2-stemmer)
  2.0.1, MIT, notice kept in the file.
- Model and runtime: Qwen3.5-0.8B by the Qwen team, transformers.js by Hugging Face (Apache 2.0).
