# Practice reference images

`A.jpg` … `Z.jpg` (480×480) are cut from the team-approved FSL manual-alphabet chart in
`docs/assets/fsl_alphabet_chart.png`. The Practice page shows `references/<LETTER>.jpg` next to
the target letter. These approved images always take priority over photos saved in the browser.

To regenerate them, or to use a new chart (5 cells per row, A–Z in reading order):

```bash
cd ml
.venv/Scripts/python scripts/slice_reference_chart.py --chart path/to/chart.png
```

A letter without an image here (for example Ñ or NG, if added later) can get the user's own photo
in the app instead (Take photo / Upload). Under `npm run dev` that photo is also saved into this folder.
