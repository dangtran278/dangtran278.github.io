# dangtran278.github.io

Personal site of Dang Quang Thien Tran, served by GitHub Pages at https://dangtran278.github.io.

The content model (data files, publication and news collections, the author list) comes from
[academic-homepage](https://github.com/luost26/academic-homepage) by Shitong Luo (MIT license), taken at
commit `69f6589` (2026-10-22). The look is new: a one-page VS Code-style workbench, with each section shown
as a file. GitHub Pages builds it with its own Jekyll 3.9, so there is no workflow to maintain.

## Where things live

| To change | Edit |
| --- | --- |
| Name, links, bio, education, honors, skills | `_data/profile.yml` |
| Research entries | `_data/research.yml` |
| Industry experience | `_data/experience.yml` |
| Projects | `_data/projects.yml` |
| Publications | one file per paper in `_publications/` |
| News | one file per item in `_news/` (the home page shows the newest five) |
| Section file names, icons and order in the tabs and Explorer | `_data/files.yml` |
| Figures | `cover:` in a paper's front matter or a project entry; put images in `assets/images/figures/` |
| Template credit at the end of the page | `footer_text` in `_data/display.yml` |
| Photo | replace `assets/images/photos/portrait.svg`, or point `portrait_url` at a new file |
| CV and resume | `assets/files/` |

The PDFs in `assets/files/` are public versions: no phone number, and the unpublished projects appear as
topic lines only. Regenerate them rather than copying the private CV over them.

## Preview locally

With Docker:

```sh
docker run --rm -it -v "$PWD:/srv/site" -w /srv/site -p 4000:4000 ruby:3.1 \
  sh -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

Then open http://localhost:4000.

## Layout code

| Part | File |
| --- | --- |
| Page shell (title bar, activity bar, Explorer, tabs, status bar, quick open) | `_layouts/vscode.html` |
| Sections | `index.html` |
| Small pieces (profile, file icons, keyword lines, figures) | `_includes/vscode/` |
| Light+ and Dark+ themes, layout, phone view | `assets/css/vscode.css` |
| Section tracking, theme and Explorer toggles, quick open (Ctrl K), minimap | `assets/js/vscode.js` |
| 404 page | `404.html` with `_layouts/prompt.html` |
