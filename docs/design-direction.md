# Design direction

A desktop asset-inspection tool for Three.js developers. The model and its pixels are the content; the interface makes their structure and cost legible.

Palette: canvas #000000, viewport #0a0a0a, raised surface #111111, border #262626, text #ededed, secondary text #888888. White primary actions; blue reserved for focus and selection feedback. Retain the established dark theme.

Type: system sans for interface text, 12–13 px body, 11 px secondary text, 14 px panel headings. Numeric values use tabular figures. Letter spacing stays at -0.02em. Sentence case throughout. No decorative eyebrows.

Layout: a 52 px Mac title bar, 42 px workspace tabs, and a flexible work area. Left-align all labels. Property values align right; controls share consistent widths. Model mode uses a 208 px searchable scene tree, flexible viewport, and 264 px property inspector. Texture mode uses a 256 px image list, flexible pixel canvas, and a 280 px settings inspector. Packing and reports use the full workspace with constrained reading widths.

    GLB Viewer / filename                        Open     Optimize
    Model     Textures     Channel packing     Size report
    Scene tree     | Model viewport          | Inspector
    Image list     | Texture canvas          | Output settings

An alternative with a separate optimization modal was reviewed and rejected: it duplicates navigation and hides the asset behind application chrome. A dashboard of metric cards was also rejected: these numbers are properties to scan, not separate destinations. Use ordinary rows, contextual controls, and borders only where panels or sections change function.

Preserve shadcn primitives, accessible controls, keyboard operation, all existing functionality, and the component architecture. Remove placeholder numbering, reassurance copy, repeated metadata, and decorative container cards. Never apply theme colors to imported model materials.
