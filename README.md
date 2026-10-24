# dangtran278.github.io

Personal site of Dang Quang Thien Tran, served by GitHub Pages at https://dangtran278.github.io.

Built on [academic-homepage](https://github.com/luost26/academic-homepage) by Shitong Luo (MIT license),
taken at commit `69f6589` (2026-10-22). GitHub Pages builds it with its own Jekyll 3.9, so there is no
workflow to maintain.

## Where things live

| To change | Edit |
| --- | --- |
| Name, links, bio, education, honors, skills | `_data/profile.yml` |
| Research entries | `_data/research.yml` |
| Industry experience | `_data/experience.yml` |
| Projects | `_data/projects.yml` |
| Publications | one file per paper in `_publications/` |
| News | one file per item in `_news/` (the home page shows the newest five) |
| Navbar links | `_data/navigation.yml` |
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
