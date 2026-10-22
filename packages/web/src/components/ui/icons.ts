// Icons copied from the Claude Design bundle (docs/design/*.html): every path,
// circle and rect below is the bundle's own markup on a 24 x 24 grid, named by
// where the design uses it. Add an icon by copying it from the bundle, not by
// drawing one. Two exceptions, drawn to the same grid and stroke because the
// bundle has none: `sidebar`, the course reader's outline toggle, and
// `monitor`, Home (the owner's choice over the bundle's house).

export type IconShape = readonly [
  tag: "path" | "circle" | "rect",
  attrs: Readonly<Record<string, string>>,
];

export const ICONS = {
  plus: [["path", { d: "M12 5v14M5 12h14" }]],
  more: [
    ["circle", { cx: "5", cy: "12", r: "1.2", fill: "currentColor" }],
    ["circle", { cx: "12", cy: "12", r: "1.2", fill: "currentColor" }],
    ["circle", { cx: "19", cy: "12", r: "1.2", fill: "currentColor" }],
  ],
  search: [
    ["circle", { cx: "11", cy: "11", r: "7" }],
    ["path", { d: "m20 20-3.5-3.5" }],
  ],
  check: [["path", { d: "M5 12.5 10 17 19 7" }]],
  "status-warning": [
    ["path", { d: "M12 4 3 19h18z" }],
    ["path", { d: "M12 10v4" }],
  ],
  "status-danger": [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M12 8v4.5" }],
  ],
  "status-info": [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M12 11v5" }],
  ],
  pencil: [["path", { d: "M4 20h4L19 9l-4-4L4 16z" }]],
  "circle-dashed": [
    ["circle", { cx: "12", cy: "12", r: "8", strokeDasharray: "3 3" }],
  ],
  "circle-half": [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "M12 4a8 8 0 0 1 0 16z", fill: "currentColor" }],
  ],
  "status-done": [
    ["circle", { cx: "12", cy: "12", r: "8" }],
    ["path", { d: "m8.5 12.5 2.5 2.5 4.5-5" }],
  ],
  "alert-circle": [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M12 8v5M12 16.5v.01" }],
  ],
  eye: [
    ["path", { d: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" }],
    ["circle", { cx: "12", cy: "12", r: "3" }],
  ],
  "eye-off": [
    ["path", { d: "M3 3l18 18" }],
    [
      "path",
      {
        d: "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.7 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6",
      },
    ],
    ["path", { d: "M9.9 9.9a3 3 0 0 0 4.2 4.2" }],
  ],
  "chevron-down": [["path", { d: "m6 9 6 6 6-6" }]],
  "chevron-up": [["path", { d: "m18 15-6-6-6 6" }]],
  clear: [["path", { d: "M7 7l10 10M17 7 7 17" }]],
  copy: [
    ["rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }],
    ["path", { d: "M5 15V6a2 2 0 0 1 2-2h8" }],
  ],
  "chevron-right": [["path", { d: "m9 6 6 6-6 6" }]],
  book: [
    [
      "path",
      {
        d: "M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2zM22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z",
      },
    ],
  ],
  briefcase: [
    ["rect", { x: "3", y: "7", width: "18", height: "13", rx: "2" }],
    ["path", { d: "M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18" }],
  ],
  info: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M12 11v5M12 7.5v.01" }],
  ],
  warning: [
    ["path", { d: "M12 3.5 2.5 20h19z" }],
    ["path", { d: "M12 10v4M12 17v.01" }],
  ],
  "wifi-off": [
    ["path", { d: "M3 3l18 18" }],
    ["path", { d: "M8.5 16.5a5 5 0 0 1 7 0" }],
    ["path", { d: "M5 12.5a10 10 0 0 1 4.5-2.6" }],
    ["path", { d: "M14.5 9.9A10 10 0 0 1 19 12.5" }],
    ["path", { d: "M12 20h.01" }],
  ],
  "check-circle": [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "m8 12.5 3 3 5-6" }],
  ],
  close: [["path", { d: "M6 6l12 12M18 6 6 18" }]],
  "log-out": [
    ["path", { d: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" }],
    ["path", { d: "M10 17l-5-5 5-5" }],
    ["path", { d: "M5 12h11" }],
  ],
  refresh: [
    ["path", { d: "M20 11a8 8 0 1 0-2.3 5.7" }],
    ["path", { d: "M20 4v7h-7" }],
  ],
  trash: [
    ["path", { d: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" }],
  ],
  "chevron-left": [["path", { d: "m15 6-6 6 6 6" }]],
  list: [["path", { d: "M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" }]],
  sidebar: [
    ["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2" }],
    ["path", { d: "M9 4v16" }],
  ],
  monitor: [
    ["rect", { x: "3", y: "4", width: "18", height: "12", rx: "2" }],
    ["path", { d: "M8 20h8M12 16v4" }],
  ],
  settings: [
    ["path", { d: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" }],
    ["circle", { cx: "16", cy: "6", r: "2" }],
    ["circle", { cx: "10", cy: "12", r: "2" }],
    ["circle", { cx: "18", cy: "18", r: "2" }],
  ],
  link: [
    ["path", { d: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" }],
    ["path", { d: "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" }],
  ],
  award: [
    ["circle", { cx: "12", cy: "9", r: "6" }],
    ["path", { d: "M8.5 14 7 22l5-3 5 3-1.5-8" }],
  ],
  target: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["circle", { cx: "12", cy: "12", r: "5" }],
    ["circle", { cx: "12", cy: "12", r: "1" }],
  ],
  user: [
    ["circle", { cx: "12", cy: "8", r: "4" }],
    ["path", { d: "M4 21a8 8 0 0 1 16 0" }],
  ],
  file: [
    [
      "path",
      { d: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z" },
    ],
    ["path", { d: "M14 3v5h5M9 13h6M9 17h6" }],
  ],
  lightbulb: [
    ["path", { d: "M9 18h6M10 21h4" }],
    [
      "path",
      {
        d: "M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
      },
    ],
  ],
  code: [["path", { d: "m8 8-4 4 4 4M16 8l4 4-4 4" }]],
  globe: [
    ["circle", { cx: "12", cy: "12", r: "9" }],
    ["path", { d: "M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" }],
  ],
  clock: [
    ["path", { d: "M12 7v5l3 2" }],
    ["circle", { cx: "12", cy: "12", r: "9" }],
  ],
  "eye-closed": [
    ["path", { d: "M3 3l18 18" }],
    [
      "path",
      {
        d: "M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.6 6.6C3.7 8.3 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.4-1.6",
      },
    ],
  ],
} as const satisfies Record<string, readonly IconShape[]>;

export type IconName = keyof typeof ICONS;
