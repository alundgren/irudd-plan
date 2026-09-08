# Canvas width and zoom review

Tested at 1440 × 900 with the reported epic goal, long work-item titles, short goals, and a visual reference with a long caption on every item. The browser test covers each count from 1 through 15 at 200%, 190%, continuing in ten-point increments through 10%, plus the 0.1% minimum. It also checks Fit separately for every count.

## Chosen layout

The goal spans the overview grid, with a 65ch text limit. Its label scales with the camera. Full goal reading uses up to 1000px of available width.

Summary cards are 1600 canvas pixels wide. The grid favors more columns, then removes any column that would leave the row count unchanged. Counts of 1, 4, 8, and 15 use 1, 2, 4, and 5 columns respectively. Columns stay fixed during zoom. Reading frames remain 1200px wide with their existing description and reference columns.

Hidden full documents remain mounted without holding summary rows open. Reference captions have three-line previews, a full hover title, and navigation to the complete reference. Item titles and short goals remain complete.

## Tradeoffs checked

| Trial                                                   | Result                                                                                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Narrow goal and full document heights in overview       | Tall goal wrapping and empty card space force small Fit text.                                                         |
| Compact rows with complete reference captions           | Long captions still forced the 15-item trial to about 11% zoom.                                                       |
| Five columns with 1200px summaries and caption previews | Better density, but long titles still wrapped into three lines.                                                       |
| Five columns with 1600px summaries and caption previews | Uses almost the full viewport width. The 15-item trial fits at about 16.6%, with 16px titles and 14.4px summary text. |

The final Fit test requires at least 15.9px title text at all fifteen item counts. The zoom sweep checks that items do not overlap and that the goal label stays readable at 20% and above.

| Zoom         | Intended use                                                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| 200%–100%    | Read or inspect full content; pan to reach content beyond the viewport.                                                          |
| 90%–50%      | Browse full documents at reduced scale; selecting an item restores its reading view. Fit still uses summaries.                   |
| 40%–20%      | Scan complete titles and short goals with reference previews.                                                                    |
| 10% and 0.1% | Spatial overview only. The font cap allows Fit to include very large plans or distant comments; use the chooser to read an item. |

[Four-item preview](captures/horizontal-4-items.png) · [Fifteen-item preview](captures/horizontal-15-items.png)

The existing function-length, file-length, and complexity advisories remain. Splitting the camera component or the single zoom-matrix scenario only to meet line limits would add unrelated restructuring to this layout change.
