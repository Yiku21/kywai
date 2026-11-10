// Guías de los estilos de película propios de kywai (src/shared/filmStyles.ts, los que llevan `base`). Tienen la forma
// de una guía de estilo de Lemo-Opuscar (styles/<slug>/STYLE.md, los mismos apartados) para que el agente trabaje
// igual que con los de la biblioteca: kywai deja la guía en la carpeta de la película y el motor sale del estilo base.
// Escritas por kywai a partir de cómo se ven, sin prompts ni código de nadie; en inglés, como la biblioteca.

const HEAD = (name: string, line: string, refs: string): string =>
  `# ${name} — Style Prompt (kywai)\n\n> ${line}\n> References (grammar only): ${refs} Never copy their drawings, characters, layouts or music.\n`

const ENGINE = (base: string, what: string): string =>
  `## 10. Engine\n\nThere is no demo for this style. Build on the engine of the library style \`${base}\` (fetch its demo with \`setup.sh demo ${base}\` and read its STYLE.md §2 and §10): ${what} This guide wins wherever the two differ.\n`

export const KYWAI_FILM_GUIDES: Record<string, string> = {
  'kywai-ink-doodle': [
    HEAD(
      'Ink Doodle',
      'Black fineliner doodles on off-white notebook paper, drawn live while the narrator talks: wobbly lines that boil, hand-lettered words, arrows, stars and little stick figures that react.',
      'margin doodles in school notebooks (scribbled stars, boxed words, arrows); sketchnoting (one idea = one boxed drawing linked by arrows); hand-drawn YouTube explainers.'
    ),
    `## 1. Essence, and what it is not

- **One sheet of paper**, dotted or lined, slightly warm. Everything is drawn on it with one black pen; a single highlighter colour may mark the key word.
- **Lines boil**: every drawn stroke is re-jittered 2–3 times per second (on twos), so the page feels alive even when nothing new is drawn.
- **Doodle vocabulary**: boxes, clouds, arrows, underlines, stars, spirals, checkmarks, stick figures with dot eyes, scribble fills. Simple and a little clumsy on purpose.
- **Words are hand-lettered**, never typed, and are written stroke by stroke on the word.

Not Whiteboard (no glossy board, no floating markers, no magnets), not One-line Drawing (many strokes, lifted pen), not Crayon Picture Book (no colour fills, no wax).

## 2. Materials & rendering

- Paper: off-white (#f6f1e6 example) with a faint dot grid or ruled lines, a soft vignette, paper grain noise anchored to the page, a fold or ring-binder edge only if the camera goes wide.
- Ink: near-black, alpha ~0.92, multiply. Width 3–6 px at 1080p, small pressure taper at ends, slight ink pooling at stroke starts.
- Boil: offset every vertex with low-amplitude noise (1–2 px) re-seeded every 2nd or 3rd frame; never boil the paper.
- Scribble fill: zig-zag hatching inside a shape, drawn as one fast stroke.
- Highlighter (optional): a translucent band (yellow, ~35 %, multiply) swiped behind a word in one stroke.

## 3. Colour logic

Black ink only, plus at most one highlighter colour reserved for the single most important word or object of each scene. Paper stays neutral. No gradients, no shading except hatching.

## 4. Type & subtitles

- All on-page words in a single-stroke handwriting font (licence-free, e.g. a Hershey or OFL single-line script), written in stroke order with small rotation and baseline jitter.
- Subtitles: a hand-cut paper strip at the bottom (white, torn edges, soft shadow), handwriting-like face, dark text, ≤ 42 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

On twos (12 fps feel) for the boil and character poses; drawing strokes advance every frame with slow-fast-slow speed. Things appear by being drawn, disappear by being scribbled out or erased with a smudge. Stick figures pose in 2–4 key poses, no in-betweens.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked page | read this | a definition; a list; a joke landing |
| Slide to the next empty area of the page | the next idea | a sequence; a "then" |
| Quick push into a tiny doodle | this detail matters | a number; a name; a punchline |
| Pull back to the full page | everything connects | a summary; a mind map |
| Page flip | a new chapter | a time jump; a new topic |

Keep the bottom 12 % free for subtitles. No cuts inside one page; between pages, a flip.

## 7. Sound palette

Pen scratch on paper for every stroke (band-passed noise following the stroke speed), a soft tap at each pen lift, paper rustle on flips. Music: ukulele, plucked guitar, light glockenspiel or lo-fi beat, well under the voice. Cartoon accents for reactions (a boing, a pop). Friendly, close voice. −14 LUFS.

## 8. Native moves

- **Scribble-out.** A wrong idea is crossed out with a frantic scribble. *Fits content like:* a myth; a common mistake; an old way of doing things.
- **Arrow chain.** An arrow grows from one doodle to the next and drags the camera with it. *Fits content like:* a process; cause and effect; a timeline.
- **Margin reaction.** A tiny stick figure in the margin reacts (sweat drop, exclamation, thumbs up). *Fits content like:* a surprising fact; a warning; a win.
- **Box it.** The key word gets boxed twice and highlighted. *Fits content like:* the takeaway; a term; a price.

## 9. Pitfalls of the medium

- Boil too strong reads as shaky video: keep it ≤ 2 px. - Too many doodles at once: one new drawing per sentence. - Typed text sneaking in: every on-page word is drawn. - Perfect geometry: add overshoot and wobble.
`,
    ENGINE('whiteboard', 'its stroke, single-line font and pen timing code; swap the glossy board for paper, drop the floating markers and magnets, add the boil.'),
    `## 11. Variation space

You decide the page type (dotted, lined, squared, sticky notes), the highlighter colour or none, the doodles, the structure, opening and ending. Structures: a mind map that grows from the centre; a numbered list down the page; a comic strip of boxed panels. Openings: a title doodled and boxed; a question mark that grows; a blank page and a first dot. Endings: a full-page pull-back; a checkmark on the last box; the page torn out.
`
  ].join('\n'),

  'kywai-deep-time': [
    HEAD(
      'Deep Time',
      'A slow, dark, cinematic documentary about huge spans of time: a planet, a landscape or a sky transforming over millions of years while a year counter spins and the camera barely moves.',
      'natural-history documentaries about the age of the Earth (time-lapse of continents, slow orbit shots); the "cosmic calendar" idea (huge time folded into one familiar unit); planetarium shows.'
    ),
    `## 1. Essence, and what it is not

- **Time is the subject.** Each shot is one place seen across an immense span: continents drift, seas fill and dry, life spreads, ice comes and goes.
- **A counter owns the frame**: a large, thin year or age counter ("4.5 billion years ago" → "today") that accelerates and decelerates with the story.
- **Darkness and scale**: deep blacks, small bright subjects, lots of negative space, a slow camera.
- **Procedural worlds**: planets, terrain and skies are generated (noise heightfields, simple shaders), never photographs.

Not Dataviz (no charts), not Satellite Briefing (no real imagery, no sources needed), not Low-poly Island (realistic-soft shading, not faceted toys).

## 2. Materials & rendering

Three.js or canvas: a planet sphere with noise-driven land/sea and a soft atmosphere rim; terrain heightfields with fog; star fields with slow parallax. Time drives every parameter (sea level, ice caps, vegetation colour, cloud cover). Light grain and a gentle bloom on bright points. Film-like contrast curve.

## 3. Colour logic

Near-black ground; each era owns one hue family (molten orange, ocean blue, ice white, green life) and the transition between eras is a colour shift. The counter and subtitles are off-white. One warm accent marks "now" or "us".

## 4. Type & subtitles

Thin, wide sans (licence-free, e.g. Inter Light or Manrope ExtraLight) for the counter (120–220 px) and era names (spaced capitals, 36–60 px). Subtitles: plain off-white text with a soft shadow, bottom centre, ≤ 44 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

On ones, smooth. Time accelerates with an ease-in-out on a logarithmic scale (millions of years pass in seconds, the last thousand years take as long). Nothing pops: everything fades, grows or drifts. The counter ticks with motion blur when fast and clicks to a stop on the important date.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Very slow orbit of the planet | everything changes but the place | an era passing; a summary |
| Locked wide shot of a landscape | watch time work | erosion; a sea filling; a forest spreading |
| Slow push from space to ground | from the big picture to one place | a first life; a city; "here" |
| Pull back from the ground to space | our moment is tiny | the ending idea; a scale shock |
| Freeze with the counter stopped | this date matters | an extinction; a birth; a first |

Allowed transitions: dissolves, fades to black, a match dissolve on the same horizon. No hard cuts except one shock moment per film.

## 7. Sound palette

Deep drones, slow swelling strings or synth pads, a low heartbeat-like pulse for the counter, wind and distant rumbles for the planet, total silence for one beat before the biggest date. Calm, low, serious narrator. Music ducked under voice. −14 LUFS.

## 8. Native moves

- **The fold.** The whole span is folded into one day or one year ("if Earth's history were one day, we appear at 23:59:59"). *Fits content like:* the age of the universe; the history of a company; how long plastic lasts.
- **Counter brake.** The counter races, then brakes hard on one date. *Fits content like:* an extinction; an invention; a deadline.
- **Layer cut.** The ground is sliced to show layers, each labelled with its age. *Fits content like:* geology; archaeology; versions of a product.

## 9. Pitfalls of the medium

- Too fast: the viewer must feel the slowness; let shots breathe 4–8 s. - Busy frames: one subject per shot. - Unreadable counter on bright frames: add a soft dark plate. - Fake precision: round dates and say "about".
`,
    ENGINE('lowpoly-island', 'its three.js world, sky and post chain; replace the faceted props with smooth noise terrain and a planet sphere, and drive every parameter from one time value.'),
    `## 11. Variation space

You decide the place (a planet, a valley, a coastline, a city), the span, the eras and the counter's unit. Structures: one continuous shot with the counter; chapters by era; a countdown to now. Openings: black and one point of light; the counter alone; a landscape that starts to move. Endings: pull back to the pale dot; the counter stops at today; the counter keeps going into the future.
`
  ].join('\n'),

  'kywai-neon-silhouette': [
    HEAD(
      'Neon Silhouette',
      'Pure black silhouettes against glowing neon gradients: a magenta-to-cyan sky, a rim of light on every edge, synth music, and everything told in shapes and outlines.',
      'synthwave poster art (sunset gradient, grid horizon); film-noir silhouette staging (characters readable only by outline); music-video lighting with coloured rim lights.'
    ),
    `## 1. Essence, and what it is not

- **Silhouettes only**: characters, objects and cities are flat pure black shapes; detail lives in the outline.
- **Neon light behind**: a saturated gradient sky or backlight (magenta, violet, cyan, orange) with a thin glowing rim on silhouette edges.
- **Glow**: bloom on every light source, light haze, a few floating particles.
- **Strong poses**: readable gestures in profile, like shadow theatre lit by neon.

Not 60s Spy Titles (no cut paper, no four flat inks), not Shadow Puppet (no puppets or rods, no warm lamp), not Hologram HUD (no interface, no transparency).

## 2. Materials & rendering

Canvas or WebGL: background gradient + soft radial glow + horizon line or grid; silhouettes as filled vector shapes (#000) with a 2–4 px rim light in the backlight colour (offset outline + blur). Bloom pass, a gentle film grain, light chromatic aberration at the edges only. Optional reflections on a wet floor (flipped, blurred, darkened).

## 3. Colour logic

Two neon hues per film (one dominant, one accent) plus black. Silhouettes are always black; colour lives only in the light. The accent hue appears only on what matters (a heart, a key, a word).

## 4. Type & subtitles

Neon-tube or wide geometric sans (licence-free, e.g. Monoton for titles, Montserrat for subtitles). Titles glow and flicker on. Subtitles: white with a soft glow in the dominant hue, bottom centre, ≤ 40 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

On ones, smooth and slightly slow-motion; silhouettes move with weight. Lights pulse on the beat. Appear by walking into light or by a light switching on; disappear by the light going out.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Lateral track with silhouettes walking | a journey | a story; a process; time passing |
| Low angle against the sky | power, hope | a decision; a hero moment |
| Slow push into a silhouette | inner moment | doubt; a realisation |
| Light sweep across the frame | reveal | a new idea; a twist |
| Wide city skyline | the world | context; scale |

Transitions: light flashes to white or black, wipes by a silhouette crossing the lens.

## 7. Sound palette

Synthwave: analog bass arpeggios, gated reverb drums, warm pads, a lead synth for the hook. Foley minimal and soft (footsteps, a hum of neon tubes, buzz on flicker). Voice warm and close. Music ducked. −14 LUFS.

## 8. Native moves

- **Rim reveal.** A shape is invisible until a light sweeps behind it. *Fits content like:* a hidden problem; a product reveal; a new character.
- **Flicker title.** A word flickers on like a neon sign, one letter late. *Fits content like:* a name; a chapter; a key number.
- **Shadow duel.** Two silhouettes face each other with two colours of light. *Fits content like:* a comparison; a debate; before/after.

## 9. Pitfalls of the medium

- Grey silhouettes kill the look: keep them pure black. - Unreadable poses: always profile or three-quarter, limbs separated from the body. - Too many colours: two hues. - Bloom so strong text blurs: keep text on its own layer.
`,
    ENGINE('spy-titles', 'its silhouette rigs, poses and walk cycles; replace the paper inks with a neon gradient, rim light and bloom.'),
    `## 11. Variation space

You decide the two hues, the world (city, desert road, stage, space), the characters, the structure, opening and ending. Structures: one long walk; a chase; a dialogue of two silhouettes. Openings: a single light turns on; a sun rises on the grid; a door opens to light. Endings: the light fades out; the silhouette walks into the sun; the title flickers on.
`
  ].join('\n'),

  'kywai-pov-doodle': [
    HEAD(
      'POV Doodle',
      'The viewer is the main character: everything is drawn in first person, your own doodled hands in the frame, and the story happens around you in simple marker drawings.',
      'first-person "POV" short videos (the camera is your eyes, your hands in frame); sketch-style explainer cartoons; comic strips told in second person ("you open the door…").'
    ),
    `## 1. Essence, and what it is not

- **First person always**: the frame is the viewer's eyes; their two drawn hands enter from the bottom to hold, point, type or wave.
- **Second-person narration**: "you wake up", "you open your laptop". The viewer is never shown from outside.
- **Marker doodles**: thick black outlines, flat fills in two or three soft colours, simple faces for other characters looking at "you".
- **Head movement**: the view sways gently, turns and looks down, like a person.

Not Ink Doodle (that one is a page; this is a world seen through your eyes), not Cartoon presenter (no host), not a screencast.

## 2. Materials & rendering

Canvas: drawn scenes in layers (foreground hands, middle objects, background room) with parallax on head turns. Black outline 6–10 px with slight boil on twos; flat fills, no gradients except a soft vignette. Hands are a reusable rig (palm, fingers in a few poses: hold, point, open, type, thumbs up).

## 3. Colour logic

White or very pale ground, black outlines, two or three soft fill colours chosen for the film, one accent colour for the object that matters in each scene. Skin of the hands in one neutral tone.

## 4. Type & subtitles

Rounded handwriting font (licence-free, e.g. Patrick Hand or Gochi Hand). Thought bubbles and labels drawn in the world. Subtitles: dark text on a white rounded pill, bottom centre, ≤ 40 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

Characters and hands on twos with 3–5 poses per action; head sway on ones (slow sine, 1–2 % of the frame). Objects pop in with a small squash. Blinks: a quick black fade from top and bottom, like eyelids.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Look down at your hands | you are doing it | a step; using a tool; a choice |
| Turn the head to someone | someone talks to you | a dialogue; advice; a reaction |
| Blink cut | time passes | the next day; a new scene |
| Lean in | focus | reading; a detail; a secret |
| Look up | something big | a reveal; scale; a dream |

Transitions are blinks or head turns; no third-person shots.

## 7. Sound palette

Close foley for what your hands do (keys, paper, a cup, a door), room tone, breathing only for effort or surprise. Music: light acoustic or lo-fi, quirky pizzicato for comedy. Narrator speaks to "you", relaxed and close. −14 LUFS.

## 8. Native moves

- **Your hands try.** Your hands attempt a step, fail comically, then do it right. *Fits content like:* a tutorial; a habit; a common mistake.
- **Inner voice bubble.** A thought bubble appears at the top of the frame. *Fits content like:* a doubt; a tip; a joke.
- **Eyelid time-skip.** A blink jumps ahead in time. *Fits content like:* a routine; a week; before/after.

## 9. Pitfalls of the medium

- Showing the viewer from outside breaks the style: never. - Hands too big hide the scene: ≤ 30 % of the frame. - Motion sickness: keep sway gentle and turns eased. - Third-person narration: always "you".
`,
    ENGINE('midcentury-toon', 'its toon shapes, ink ribbons and hand rig; draw the hands from the viewer\'s point of view and add the head-sway camera.'),
    `## 11. Variation space

You decide where "you" are, who you meet, the fill colours, the structure, opening and ending. Structures: one day in your life; a step-by-step task in your hands; a choose-your-path with two outcomes. Openings: eyes open on a ceiling; your hands on a keyboard; a message on your phone. Endings: a thumbs up to camera; eyes close; you hand the object to the viewer.
`
  ].join('\n'),

  'kywai-crystal-3d': [
    HEAD(
      'Cute 3D Crystals',
      'Soft, glossy 3D crystals and gems with cute little faces, floating in a pastel studio: refraction, sparkles and bouncy motion make tech or abstract ideas friendly.',
      'cute 3D icon sets (rounded shapes, pastel studio light, soft shadows); toy-like product renders; mascot animation with squash and stretch.'
    ),
    `## 1. Essence, and what it is not

- **Crystal characters**: faceted but rounded gems (octahedrons, hexagonal prisms, clusters) with two dot eyes and a tiny mouth; they float, bounce and react.
- **Pastel studio**: a soft gradient background, a floor that fades into it, big soft key light and a coloured rim.
- **Glass and glow**: transmission, a little dispersion, internal glow that pulses when a character "thinks".
- **Sparkles**: small four-point stars twinkle on highlights.

Not Glass Product (no dark field, no premium launch, no exploded views), not Low-poly Island (no world, characters only), not Brick Toy.

## 2. Materials & rendering

Three.js: MeshPhysicalMaterial with transmission, thickness, IOR ~1.5, clearcoat, a subtle iridescence; an emissive core that pulses. Environment: soft studio HDR (procedural) with two coloured lights. Soft contact shadows, gentle bloom, depth of field on close-ups. Eyes are black spheres with a white highlight, always facing the camera.

## 3. Colour logic

Pastel ground (lavender, peach, mint, sky). Each crystal character has one hue that names it (the "AI core" violet, a helper mint…). One saturated accent for the hero crystal only. No black except eyes.

## 4. Type & subtitles

Rounded sans (licence-free, e.g. Nunito or Baloo 2), 3D extruded titles in the same glass material for the opening. Subtitles: white rounded pill with soft shadow, dark text, ≤ 40 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

On ones. Bouncy springs (overshoot ~10 %), squash and stretch on landing, idle float (slow sine bob and spin). Characters blink every 3–6 s. Appear by popping in with sparkles; leave by shrinking with a twinkle.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Slow orbit around a crystal | look at this | an intro; a feature; a character |
| Push into the glowing core | what's inside | how it works; the brain of a system |
| Wide group shot | a team | parts of a system; a comparison |
| Rack focus between two crystals | a relationship | cause and effect; a conversation |
| Overhead with crystals in a pattern | structure | a network; a sequence |

Transitions: a sparkle wipe, a camera whip with motion blur, or a crystal flying through the lens.

## 7. Sound palette

Glass chimes, soft bells, bubbly pops, a crystal "ting" for each landing, a low warm hum for the core. Music: playful synth pop, music box, marimba. Voice friendly and bright. −14 LUFS.

## 8. Native moves

- **Core pulse.** The hero crystal's core lights up when it has an idea. *Fits content like:* an AI answering; a decision; a eureka.
- **Crystal cluster.** Small crystals snap together into a bigger one. *Fits content like:* teamwork; data combining; a product built from parts.
- **Refraction peek.** The camera looks through a crystal and sees the next idea distorted, then clear. *Fits content like:* a new perspective; a transformation; a reveal.

## 9. Pitfalls of the medium

- Too realistic glass looks cold: keep it soft, rounded and pastel. - Faces too detailed become creepy: dots only. - Transmission is heavy to render: lower samples, render at 1080p, check timing early. - Noisy sparkles: a few at a time.
`,
    ENGINE('glass-product', 'its glass materials, studio environment and staging code; switch the dark field for a pastel studio, round the shapes and add the faces and springs.'),
    `## 11. Variation space

You decide the characters, their hues, the studio colour, the structure, opening and ending. Structures: one crystal explains itself; a team of crystals solves a problem; a crystal grows step by step. Openings: a crystal falls and bounces into frame; a glowing core in the dark that lights the studio; the title in glass. Endings: all crystals cheer; the hero crystal winks; they snap into the logo shape of the topic (never a real brand).
`
  ].join('\n'),

  'kywai-office-flat': [
    HEAD(
      'Flat Office Cartoon',
      'Friendly flat vector illustration of people at work: simple characters without outlines, pastel corporate colours, desks, screens and plants, with chapter cards like "Week 2".',
      'modern flat corporate illustration (rounded people, no outlines, big simple shapes); onboarding and HR explainer videos; editorial spot illustrations.'
    ),
    `## 1. Essence, and what it is not

- **Flat shapes, no outlines**: people and objects built from rounded vector shapes in solid colours, one shade darker for shadows.
- **Simple people**: small heads, long bodies, no or minimal faces, varied skin tones and hair, clear gestures.
- **Office world**: desks, laptops, mugs, plants, whiteboards, video calls, charts, sticky notes.
- **Chapter cards**: big type cards ("Week 2", "Step 3", "Day 1") between sections.

Not Mid-century Cartoon (no broken ink line, no 50s print offset), not Isometric Infographic (front and side views, not isometric), not Pictograms.

## 2. Materials & rendering

SVG or canvas vector shapes, flat fills, shadows as one darker flat shape, a few soft long shadows at 10 % opacity. Subtle grain texture (2–3 %) to avoid sterile flats. Characters are rigs of shapes (head, torso, arms with two segments, legs) with a small pose library.

## 3. Colour logic

Off-white or very light pastel ground. A palette of 4–6 muted colours (example: navy, coral, mustard, sage, lilac) used consistently: one colour per team or idea. One accent for the key action. Text in navy, never pure black.

## 4. Type & subtitles

Geometric sans (licence-free, e.g. Poppins or DM Sans): chapter cards 140–220 px bold, labels 32–48 px. Subtitles: navy text on a white rounded bar, bottom, ≤ 42 characters per line. Hold ≥ max(1.8 s, speech + 0.6 s).

## 5. Motion quality

On ones with snappy ease-out (power3), small overshoot on pops. Characters move in 3–6 poses with smooth tweens between, idle breathing. Objects slide in from off-frame, charts grow, sticky notes flip. Nothing wobbles.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Side-scroll along a row of desks | a team, a flow | departments; a pipeline; a day |
| Zoom into a laptop screen | the work itself | a tool; a result; a message |
| Split screen of two people | two sides | a call; a handoff; before/after |
| Chapter card slam | a new phase | weeks; steps; milestones |
| Wide office | the whole picture | context; the company; a summary |

Transitions: shape wipes in the palette colours, a card sliding over the frame.

## 7. Sound palette

Light corporate-friendly music (claps, plucks, upbeat ukulele or soft electro), clicky UI sounds, keyboard, notification pings, paper slides, a whoosh for cards. Voice clear and warm, like an onboarding video. −14 LUFS.

## 8. Native moves

- **Week cards.** Big chapter cards mark progress over time. *Fits content like:* a plan; a course; a project timeline.
- **Screen dive.** The camera dives into a laptop and the next scene is inside the screen. *Fits content like:* software; a dashboard; an email.
- **Handoff.** An object passes from one person to the next across desks. *Fits content like:* a workflow; a task moving between agents; a supply chain.

## 9. Pitfalls of the medium

- Too generic: give each character one distinct trait (hat, hair, colour). - Outlines creeping in: none. - Too many colours: stay in the palette. - Cluttered desks: three props per desk at most.
`,
    ENGINE('midcentury-toon', 'its shape, plane and two-plate text helpers and its character rig; remove the ink line and print offset, use flat fills with one-shade shadows.'),
    `## 11. Variation space

You decide the workplace (office, studio, remote homes, a school), the team, the palette, the structure, opening and ending. Structures: week by week; one task passing through people; a problem and its fix. Openings: an empty office lights up; a laptop opens; a chapter card "Day 1". Endings: the team high-fives; a chart goes up; the last card "Done".
`
  ].join('\n'),

  'kywai-paper-diorama': [
    HEAD(
      'Paper Craft Diorama',
      'A handmade stage of cut construction paper: layered paper sets with torn edges and soft drop shadows, a blocky little paper mascot that changes costume every scene, a big counter that ticks up and words stuck on as paper labels, one at a time.',
      'construction-paper school crafts and felt boards; stop-motion papercraft and puppet theatre; "top 5" listicle explainers built as a row of little stages.'
    ),
    `## 1. Essence, and what it is not

- **Everything is paper on a tabletop stage**: backgrounds, props and characters are flat cut shapes in matte construction paper, stacked in 3–6 layers with soft shadows between them, so the frame reads like a shoebox diorama shot from the front.
- **One recurring mascot**: a blocky paper character (rectangular body, two dot eyes, stubby paper arms and feet) that gets a new paper costume or prop for each idea (a hat, glasses, a tool, an apron). If the user chose a character, build that character from paper the same way.
- **A counter in every scene**: a paper card with a big number that ticks (0 → 3, #6 → #1, 0 m → deep, "9 h") and makes the idea measurable.
- **Labels, not typed overlays**: the headline sits on a paper banner or bunting at the top, and the spoken words appear one or two at a time as paper labels stuck at the bottom, the key word on a coloured label.
- **Numbered rounds**: content is often a list ("1/5 … 5/5"), each item a new little stage behind a curtain, a door or a page.

Not Red Paper-cut (no festive red silhouettes, no symmetry), not Paper Pop-up Book (no book, no 3D folds), not Paper-cut Lightbox (no backlight), not Flat Office Cartoon (texture, torn edges and shadows instead of clean flats).

## 2. Materials & rendering

- Canvas or SVG at 1920×1080 (or 1080×1920), all shapes flat paths filled with a **paper texture**: a tiled fibre/grain noise multiplied at 6–10 %, slight colour variation per sheet, never a gradient on a single sheet.
- **Cut edges**: shapes have slightly irregular outlines (low-amplitude noise on the path, 1–2 px) and a thin lighter rim on the top-left edge; torn paper (labels, banners, the stage floor line) gets a ragged white fibre edge.
- **Layering and shadow**: each layer casts a soft drop shadow (offset 6–14 px down-right, blur 10–18 px, 25–35 % opacity) on the one behind; the farther apart two layers are, the bigger the offset. Masking tape strips (translucent beige, 40 % opacity, torn ends) hold banners and cards.
- **Sets** = a wall (striped wallpaper, a painted sky with paper clouds, a night sky) + a floor band (wood-grain paper, a grass strip, a checkerboard) with a ragged edge where they meet.
- **The mascot**: a rounded rectangle body, two black dot eyes (blinks by swapping to two short lines, happy eyes as ^ ^), no mouth or a tiny one; arms and feet are separate paper pieces hinged at one corner. Costume pieces are their own layers.
- \`render(t)\` is a pure function of \`t\` (same frame for the same time).

## 3. Colour logic

Warm, saturated craft-paper colours on each set: one dominant wall colour per round (teal, magenta, mustard, brick red, purple, sky blue) and a brown wooden floor that repeats in every scene to tie the film together. The mascot keeps one colour (example: salmon). Labels are off-white with dark text; the key word of each line goes on a label in the mascot's colour. Counters and scoreboards are off-white cards or dark chalk-like boards with white numbers. Never pure black or pure white: paper is never that clean.

## 4. Type & subtitles

- Headline banner: bold rounded sans or a chunky slab (licence-free, e.g. Rubik, Archivo Black or Roboto Slab), uppercase, 56–80 px, on a torn paper strip taped at the top; the item number ("2/5") on its own coloured tab.
- Spoken words: 1–2 words per paper label (≤ 18 characters), 54–72 px, pressed on with a tiny bounce and a slight random rotation (±3°), at the bottom third; the previous label is pulled away as the next lands. Hold each label for the time the word is spoken plus 0.15 s.
- Counter digits: big monospace or slab numbers (90–140 px) on their card, with a small caption above ("BUGS", "CONECTORES", "PROFUNDIDAD").

## 5. Motion quality

Stop-motion feel: animate on twos (12 fps steps) for the mascot and props, on ones for camera and labels. Pieces arrive like paper being placed by hand: a short drop with overshoot and settle, a 2–4° rotation wobble, the shadow shrinking as the piece touches down. Paper never stretches; it bends by rotating hinged pieces. Idle life: the mascot bobs, blinks every 2–4 s, and a background element (clouds, a fan, stars, a pendulum) always moves.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked front view of the stage | look at this set | a definition; a list item; the counter changing |
| Curtain or door opens on a new stage | the next item | a ranking; "1/5 … 5/5"; a new chapter |
| Slow push towards the counter | this number matters | a statistic; a before/after; a punchline |
| Vertical slide (down a ladder, up to the sky) | depth or scale | digging deep; levels; growth |
| Pull back to show all the little stages together | everything at once | a summary; "all of them together" |

Keep the bottom 18 % for the word labels and the top 14 % for the headline banner. Transitions: a curtain sweep, a paper page slide, or a cut on a hand-placed prop.

## 7. Sound palette

Paper foley on every placement (a soft paper tap or slide), a crinkle when a label is pulled away, a click-clack when the counter ticks, a whoosh for curtain and page moves, cartoon accents for reactions (pop, boing, a tiny ding for a correct tick). Use the real effects bank (efectos/) before synthesizing. Music: playful pizzicato, marimba, ukulele or a light toy-piano beat, under the voice. Close, friendly, slightly fast voice. −14 LUFS.

## 8. Native moves

- **Costume change.** Between items the mascot ducks behind a prop and pops back in a new paper costume. *Fits content like:* a new tool; a new role; a list item.
- **Counter climb.** The number on the card rolls up (0 → 19, #6 → #1) while the set reacts (bees arrive, rivals appear). *Fits content like:* a result; a ranking; a quantity.
- **Behind the curtain.** A closed curtain or door with a "?" opens on the item. *Fits content like:* a reveal; "my favourite"; the answer.
- **Key ring.** Tags of every item hang together on one ring at the end. *Fits content like:* a recap; a bundle; "all together".

## 9. Pitfalls of the medium

- Shadows too dark or too sharp read as stickers on glass: keep them soft and warm. - Too many words at once: never more than two labels on screen. - Clean vector look: add the texture and the ragged edges to every sheet. - A still frame: something must always move. - Third-party logos or app icons: make paper symbols instead.
`,
    ENGINE('game-show', "its scene()/update(t) contract, telop timing, scoreboards, banners, burst and sound-event helpers, and the bean character rig (turned into the blocky paper mascot); replace the 8 px outlines and hard offset shadows with paper texture, ragged edges and soft layered drop shadows."),
    `## 11. Variation space

You decide the sets for each round, the mascot's costumes, the counters, the wall colours, the structure, opening and ending. Structures: a numbered top list (one stage per item); one problem dug deeper and deeper; a before/after on two stages side by side. Openings: a switchboard with every item plugged in; a curtain with the title on bunting; the counter at 0. Endings: all items on one key ring; the mascot waving from the full row of stages; a paper comment box with one word to type.
`
  ].join('\n')
}
