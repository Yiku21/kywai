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

  'kywai-checklist': [
    HEAD(
      'Checklist',
      'A clean checklist card that fills up while the narrator talks: each item slides in with an empty box, a marker stroke ticks it with a satisfying pop, a progress bar climbs "3/5", and a small illustration for the item lives beside the list.',
      'pre-flight and packing checklists; to-do apps and onboarding progress bars; "before you post, check these 5 things" listicle reels that keep a running list on screen.'
    ),
    `## 1. Essence, and what it is not

- **The list is the hero**: one card (paper, a clipboard sheet or a phone-like panel) that stays on screen for the whole film and gains one item per beat, so the viewer always sees how far along they are.
- **Ticking is the reward**: every item ends with its box being ticked by a hand-drawn marker stroke that draws itself in 0.25–0.35 s, with a tiny pop and a ding. The ticked line dims slightly (or gets a highlighter swipe) and the next empty box waits below.
- **A progress counter**: "2/5" or a bar under the title that fills with each tick, and completes with a small celebration at the end.
- **One picture per item**: next to (horizontal) or above (vertical) the list, a simple flat illustration, icon scene or real screenshot that shows the current item, swapped on each item.
- **Mistakes can be crossed**: a "don't" item is crossed out with a red X stroke instead of a tick.

Not Swiss Motion Design (warmer, hand-drawn ticks, a physical card), not Ink Doodle (the list is typeset and tidy; only the ticks and crosses are hand-drawn), not Paper Craft Diorama (no stages, no mascot by default), not Dark Keynote (light and friendly, not a product launch).

## 2. Materials & rendering

- Canvas or SVG at 1920×1080 (or 1080×1920). Background: a soft desk colour or a gentle two-tone gradient with faint grain (3–5 %); the card sits on it with a soft shadow (offset 0 18 px, blur 40 px, 18 % opacity).
- **The card**: rounded corners (24–32 px), off-white (#fbfaf7 example), an optional clipboard clip or a binder edge at the top; a title row with the counter, then the rows.
- **Rows**: an empty rounded-square checkbox (stroke 4–5 px, 44–56 px) and the item text; 1.5× line spacing, a hairline divider between rows.
- **Ticks and crosses** are marker strokes: a polyline with a slight wobble, round caps, 9–12 px, drawn with stroke-dashoffset from start to end; a small ink blot at the start. Ticks in the accent colour, crosses in red.
- **Highlighter**: a translucent band (accent at 30 %, multiply) swiped behind the key words of the current item.
- The illustration panel: rounded rectangle, flat shapes or a real screenshot with a 2 px border; it crossfades or flips per item.
- \`render(t)\` is a pure function of \`t\` (same frame for the same time).

## 3. Colour logic

Calm neutrals (warm white card, a soft desk colour) plus **one accent** for ticks, the progress bar and the highlighter (green, teal or the brand colour), red only for crossed "don't" items. Text in near-black (#1c1c22), done items at 55 % opacity. The illustration panel may use 2–3 muted colours that match the accent.

## 4. Type & subtitles

- Title: bold geometric or rounded sans (licence-free, e.g. Inter, Manrope, Nunito), 56–80 px; counter in tabular numbers on a pill.
- Items: the same family, semibold, 40–56 px, max 6 words per item; the item being spoken is fully opaque, the upcoming boxes are empty and their text appears only when they are reached.
- Subtitles: a small rounded caption pill at the bottom (dark at 85 %, white text, ≤ 38 characters per line), word-synchronised highlight in the accent colour; keep it off the card.

## 5. Motion quality

On ones, crisp and quick. Items slide in from the right (or rise from below in vertical) 30–40 px with a short ease-out and a 120 ms fade. The tick lands on the word that completes the item, with a 1.12× pop of the box and a ripple. The progress bar eases to its new length in 300 ms. Idle life: the current box breathes very slightly, the illustration has a slow parallax, a cursor or pen hovers near the next box.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked on the whole card | here is the list | the intro; a recap |
| Gentle push onto the current row | this item now | each item; a key detail |
| Slide to the illustration panel | see what it means | an example; a before/after |
| Pull back to show the full, ticked list | done | the ending; "save this" |
| Card flip to a second card | the next list | part 2; "and the bonus" |

Keep the bottom 14 % for subtitles. Transitions: card flip, a page tear-off from the pad, or a quick slide.

## 7. Sound palette

A soft marker squeak on every tick, a pop and a bright ding when the box fills, a lower "nope" thud on a red cross, a paper slide when an item enters, a small chime and confetti whoosh when the list completes. Use the real effects bank (efectos/) before synthesizing. Music: light upbeat lo-fi or a clean pop beat under the voice. Clear, friendly, slightly brisk voice. −14 LUFS.

## 8. Native moves

- **Tick and dim.** The box ticks, the line dims and the next empty box waits. *Fits content like:* each step; a rule; a requirement.
- **Red cross.** A "don't" item gets crossed out and shakes. *Fits content like:* a common mistake; a myth; what to avoid.
- **The missing box.** At the end one box is still empty: the viewer's turn. *Fits content like:* a call to action; a question; "comment the one you skip".
- **Full bar.** The progress bar completes, the card gets a stamp ("LISTO" / "DONE"). *Fits content like:* the ending; the result.

## 9. Pitfalls of the medium

- Too much text in a row: one short line per item; details go in the voice or the illustration. - All items visible from the start: reveal one at a time. - A tick that just appears: it must draw itself. - A static card for seconds: push, highlight or swap the illustration on every beat. - Third-party logos or app icons in the illustrations: draw simple symbols instead.
`,
    ENGINE('swiss-motion', "its grid, its typographic timing, its single-accent colour rules and its sound-event helpers; build the card, the rows, the marker ticks (stroke-dashoffset), the progress bar and the illustration panel on top, warmer and softer than the Swiss look."),
    `## 11. Variation space

You decide the card (notepad, clipboard, phone panel), the accent colour, the illustrations, the number of items (3 to 7), the opening and the ending. Structures: a do/don't list (ticks and crosses); a step-by-step routine; "5 things to check before …"; a packing list where items fly into a bag. Openings: an empty card with the title being written; a messy desk tidied into the card; the counter at 0/5. Endings: the full card stamped; one empty box left for the viewer; the card folded into a paper plane.
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
  ].join('\n'),
  'kywai-app-promo': [
    HEAD(
      'App Promo Reel',
      'A fast vertical product ad on a dark starry background: every 3–4 s a new two-line claim (white line + accent line) sits above one big demo of the product doing its thing — a before/after slider, a numbered carousel, option chips, a mini editor, a result gallery, a real screen recording — and it ends on a solid brand-colour card with the logo, the address and one button.',
      'app-store preview videos and short launch ads for creative tools; before/after comparison sliders; numbered feature carousels ("01/08"); end cards with a single call to action.'
    ),
    `## 1. Essence, and what it is not

- **One promise per beat**: the whole ad is 6–9 beats of 3–4 s. Each beat has a headline of two short lines (line 1 white, the benefit; line 2 in the accent colour, the payoff or the number) and **one** demo in the centre that proves it. Nothing else on screen.
- **Show, don't tell**: every claim is proven by the product working (a screenshot, a recording, a generated result). No feature lists, no paragraphs.
- **Recurring demo formats** (pick 4–6 per ad, in this order of energy): the **transform hook** (the input turns into the output under a scanning line), **"in one click"** (one input explodes into a grid of results), the **before/after slider** (a vertical handle sweeps across a framed card with "BEFORE" and "AFTER" tags), the **numbered carousel** (items swap with a "03/08" counter and a pill label under each), **option chips** (a row of pills; the chosen one lights up and the demo changes with it), the **detail editor** (a small app window zooms in on one tool being used, with a before/after thumbnail), the **result gallery** (a sheet of outputs fills in, then export-format pills appear), the **real screen** (a browser or app window with a short recording and 2–3 ticked lines under it) and the **end card**.
- **End card**: a full solid accent-colour background, the product logo big, the address, one line ("Try it free") and one button. Held 2.5–3.5 s.

Not Dark Keynote (no stage, no presenter, no slow reveals: a beat every 3–4 s), not Living Screencast (the screen recording is only one beat of many), not Checklist (no running list), not Voxel Bots (no characters acting, the product is the hero).

## 2. Materials & rendering

- 1080×1920 by default (1920×1080 or 1080×1080 if asked). HTML/Canvas/SVG layers composited per frame; \`render(t)\` is a pure function of \`t\` (same frame for the same time).
- **Background**: near-black indigo (#0b0a14 example) with one or two very soft nebula glows (radial gradients in the accent colours at 10–20 %), 60–120 tiny stars that twinkle, and a few slow-drifting accent-coloured square specks (2–4 px) that echo the product.
- **Demo cards**: rounded rectangles (radius 20–28 px), a 1.5 px border in white at 12 %, a darker inner fill, a soft outer glow in the accent at 20 %; small uppercase tag pills in the top corners (e.g. "INPUT" left, "OUTPUT · 128" right in the accent).
- **Before/after slider**: two layers of the same frame clipped by a vertical line; the handle is a white circle with ‹ › arrows on that line; the line sweeps right → left → centre with an ease-in-out.
- **Pills and chips**: fully rounded, 26–34 px text, unselected = outline at 30 %, selected = solid accent with dark text.
- **App windows**: a macOS-like title bar with three dots (generic, no brand), an address bar with a neutral URL, real screenshots or recordings of the user's own product inside; a round click ripple where the cursor taps.
- Use the user's real screenshots, recordings and outputs whenever the topic is their product; otherwise build simple flat stand-ins. Never show other companies' logos or UI.

## 3. Colour logic

Dark neutral background plus **one or two accents** taken from the product (e.g. a violet and a pink): the second headline line, the selected chip, the tag pills, the slider handle glow and the specks use them. The end card flips the logic: solid accent background with white logo and text, and the button inverted (white with accent text). Results inside the cards keep their own colours.

## 4. Type & subtitles

- Headline: bold geometric sans (licence-free, e.g. Inter, Manrope, Poppins), 64–80 px, two lines max, centred in the top 18 %; line 2 can be a gradient of the two accents. Big numbers ("32px", "250+", "3×") go at 120–160 px in the accent.
- Small print under the headline (optional): 26–30 px at 65 % white, one line ("3 sizes · 4 formats").
- Headlines appear word by word (or letter by letter on the first beat) with a 60–90 ms stagger and a slight upward slide; they leave with a quick fade before the next beat.
- No voice by default: the headlines are the narration. If there is a voice, captions follow §4 of the reel rules (short, centred, above the safe area) and the headline stays.
- Keep the bottom 12 % clear of anything important (app UI covers it).

## 5. Motion quality

On ones, smooth and confident; ease-out on entries (220–320 ms), ease-in-out on sweeps. Beat changes are cuts on the music downbeat with a short cross-dissolve (6–8 frames) or a pixel-dissolve wipe that matches the product. Cards pop with a 0.96 → 1.0 scale; chips switch with a 120 ms colour fill; carousel items slide 40 px and fade. Idle life always: stars twinkle, specks drift, the card glow breathes, the demo keeps looping (a sprite walks, a value ticks).

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked, centred card | here is the proof | most beats |
| Slow push in (3–5 %) over the beat | keep looking | a result; a detail |
| Snap zoom into one tool of an app window | this is how | the editor beat; a click |
| Pull back from one result to the full gallery | and all of these | "in one go"; exports |
| Hard cut to the solid end card | the offer | the ending |

Transitions: cut on the beat, pixel-dissolve, a quick slide of the card, or the scanning line of the transform hook.

## 7. Sound palette

An upbeat electronic or chiptune-flavoured track with a clear downbeat every 3–4 s (cut on it), soft clicks for chips and taps, a whoosh for slides, a short shimmer or "pixel" sparkle on the transform, a riser into the end card and a bright final hit with the logo. Use the real effects bank (efectos/) before synthesizing. −14 LUFS.

## 8. Native moves

- **Transform hook.** The input (a photo, a model, a rough draft) turns into the output under a sweeping scan line or a pixel dissolve while the headline types "From … to …". *Fits content like:* the opening; the one-line promise.
- **One into many.** A single input explodes into a grid of results that pop in a ripple. *Fits content like:* "in one click"; variations; batch output.
- **Slider proof.** The before/after handle sweeps across the card. *Fits content like:* quality; a fix; an upgrade.
- **Counter carousel.** Results swap with "01/08 … 07/08" and a pill name under each. *Fits content like:* a big preset count; a library; templates.
- **Chip switch.** Choosing a chip changes the demo live ("S · M · L"). *Fits content like:* sizes; plans; styles; languages.
- **Tick list on a screen.** A real app window with 2–3 lines that tick one by one under it. *Fits content like:* "no install"; requirements; formats.
- **Brand card.** A solid colour card with the logo, the address and one button. *Fits content like:* the ending, always.

## 9. Pitfalls of the medium

- More than one claim per beat, or a headline longer than two short lines. - A static screenshot for a whole beat: something must move inside the card. - Fake results: use the product's real output, or say it is a mock-up. - Stock "AI" imagery or other brands' logos and UI: only the user's product and neutral stand-ins. - An end card with several buttons: one address, one action. - Running past 35 s: cut beats, not speed.
`,
    ENGINE('dark-keynote', "its dark background, typography timing and card helpers; drop the stage and presenter, make it vertical by default, and build the beat formats (transform hook, before/after slider, counter carousel, option chips, app window, result gallery and brand end card) as reusable components on top."),
    `## 11. Variation space

You decide the accents, which 4–6 demo formats to use and their order, the number of beats (6 to 9), the end-card wording and whether there is a voice. Structures: promise → one-click → proof slider → range (carousel) → control (chips or editor) → output (gallery + formats) → where (screen) → end card; or problem → transform → three proofs → end card. Openings: the transform hook; a big number; the before/after slider already moving. Endings: the brand card with one button; the gallery collapsing into the logo; the last result morphing into the logo.
`
  ].join('\n'),
  'kywai-voxel-bots': [
    HEAD(
      'Voxel Bots Explainer',
      'One dark night-blue stage that never cuts away: chunky voxel robots and simple props pop in and out on every spoken noun, a two-line headline with one coloured key word changes every few seconds, progress pips count the steps and a karaoke caption marks the word being said.',
      'voxel and block-figure games; vertical "stop doing X, do Y" explainer reels that build the whole story on one set; on-screen step counters and karaoke captions.'
    ),
    `## 1. Essence, and what it is not

- **One continuous set, no hard cuts**: a dark navy floor and wall with a faint grid and a few drifting stars. Things enter, transform and leave on that same stage; the "cut" is a headline swap, not a change of place.
- **Something new every 1–1.5 s**: each important noun gets its own object at the moment it is said (a robot with a tag, a crossed-out sign, a folder, a toolbox, a clipboard). The headline changes every 3–4 s; the caption changes every 1–3 words.
- **Voxel characters with roles**: grey cube robots are "the old way" (many of them, repeated, half-broken); one orange robot is "the solution"; one blocky figure with glasses (and a mug) is "you", the viewer. If the user chose a character, build it from voxels with the same roles.
- **A fixed frame of information**: a thin top bar ("SERIES · TOPIC" left, a tag right, a hairline under it), a two-line uppercase headline, progress pips (■■□) under it during the steps, and the karaoke caption at the bottom.
- **Numbered steps**: the core is usually three numbered steps ("1 · …", "2 · …", "3 · …") with the pips filling one by one.

Not Brick Toy (no studs, no toy-brick world: matte voxels on a dark stage, graphic overlays on top), not Paper Craft Diorama (no paper, no curtains, no cuts between stages), not Dark Keynote (characters and props act; it is not a product slide), not Checklist (the list is only one prop among many).

## 2. Materials & rendering

- three.js (or the base engine) at 1080×1920 by default (1920×1080 if asked). Orthographic or a long-lens perspective camera (≈ 25–35° FOV) looking slightly down, so the floor reads as a band across the lower half.
- **Voxels**: characters and props are built from boxes with 1–2 px bevels, matte (roughness 0.8–0.9), flat colour per face with a soft key light from the top-left and a cool fill; contact shadows on the floor. Eyes are flat dark squares that blink (scale Y) and turn into ^ ^ or × × for emotions.
- **Background**: #0b1220-ish navy, a faint 64 px grid (4–6 % opacity) and 20–40 small stars with slow twinkle; a subtle vignette.
- **Graphic overlays** (2D, crisp, on top of the 3D): tags as white rounded pills with black uppercase text; signs as off-white cards with a red strike line; counters as outlined cards with a big number; a comment box as a dark rounded panel with an avatar dot, a word in «quotes» and a heart.
- \`render(t)\` is a pure function of \`t\` (same frame for the same time).

## 3. Colour logic

Dark navy stage, white text, and **one meaning per colour** in the headline key word: red = the problem or the old way, yellow = a question, green = the fix or "done", cyan = a new concept. Cyan is also the caption pill and the progress pips. Robots: grey for the old way, orange for the solution; props in 3–5 saturated block colours (blue, orange, pink, yellow, green). Never more than one accent colour in the headline at a time.

## 4. Type & subtitles

- Top bar: small monospace caps (licence-free, e.g. JetBrains Mono or Space Mono), 22–26 px, 60 % white.
- Headline: heavy rounded or geometric sans in caps (e.g. Archivo Black, Rubik Black, Montserrat ExtraBold), 64–84 px, two lines max, first line white, the key word line in its colour; it swaps with a quick 120 ms slide-up and a tiny glitch flicker on strong statements.
- Caption: 1–3 words at a time, 56–72 px, bold, white with a dark outline, in the lower third above the safe area; the word being spoken sits on a cyan pill with dark text. Never more than one caption line on screen.
- Keep the top 16 % for the bar and headline and the bottom 22 % for the caption and safe area.

## 5. Motion quality

On ones, snappy and toy-like. Objects pop in with a scale overshoot (0 → 1.12 → 1 in 180–240 ms) or drop from above and settle; leaving is a fast shrink or a slide off. Robots bob, blink every 2–4 s and turn their heads to whoever speaks. Rows of identical robots appear in a ripple (staggered 30–50 ms). A "glitch" (RGB split, 2–4 frames) marks a contradiction or a reveal. Idle life always: stars twinkle, antennas wiggle, a prop rotates slowly.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked wide on the stage | here is the situation | the hook; the problem; a crowd of robots |
| Slow push onto one robot or prop | this matters | the new idea; a step's key object |
| Small lateral drift | time passing, building up | the "does this sound familiar?" stack-up |
| Quick snap zoom (8–12 frames) | surprise, contradiction | "the other way round"; a number; a punchline |
| Pull back to show everything | the summary | the ending; "while others fix 15, you fix 1" |

There are no hard cuts: transitions happen by swapping the headline and moving props on the same set.

## 7. Sound palette

A continuous, close, brisk voice with no pauses longer than 0.3 s, a light electronic beat under it, and small UI sounds on every pop-in (blip, pop, click), a whoosh for slides, a glitch buzz for contradictions, a tick for each progress pip and a soft chime for "done". Use the real effects bank (efectos/) before synthesizing. −14 LUFS.

## 8. Native moves

- **One robot per word.** Each thing the viewer does wrong is named and a grey robot with that tag pops in, until the row is overloaded. *Fits content like:* "does this sound familiar?"; too many tools; a bad habit.
- **Many into one.** A grid of grey robots collapses into a single orange robot. *Fits content like:* the turn; "the other way round"; simplifying.
- **Crossed sign.** A card with a phrase gets a red strike and a word underneath is revealed. *Fits content like:* a myth; what the experts actually said; a reframe.
- **Prop per step.** Each numbered step has one object that opens or fills (a folder with a page, a toolbox, a clipboard whose boxes get ticked). *Fits content like:* a method in 3 steps.
- **Comment box.** A comment panel with «WORD» slides down from the top at the end. *Fits content like:* a call to comment; a resource offer.

## 9. Pitfalls of the medium

- A still frame for more than 1.5 s: add, change or move something on every phrase. - A wall of text: never more than the headline plus one caption. - Several accent colours at once: one key word, one colour. - Hard cuts to other places: keep the single stage. - Third-party logos, app icons, real people or someone else's handle: make simple block symbols and keep the top bar generic.
`,
    ENGINE('brick-toy', "its 3D scene setup, lighting, materials and render loop; replace the studded bricks with plain bevelled voxels, darken the world to the night-blue stage, and build the 2D overlay layer (top bar, headline, pips, caption pill, tags and cards) on top of the render."),
    `## 11. Variation space

You decide the props, the robots' tags, the colours of the key words, the number of steps (2 to 4) and the opening and ending. Structures: "stop doing X → why it fails → the turn → 3 steps → comment WORD"; a myth crossed out and corrected; a before/after with grey robots against the orange one. Openings: a full grid of tagged robots; a crossed-out sign; one robot overloaded with tags. Endings: the comment box; a shelf of resources; a pull-back comparing "they fix 15, you fix 1".
`
  ].join('\n'),

  'kywai-machine-room': [
    HEAD(
      'Behind the Machine',
      'A dark 3D bedroom-office at night where one small pixel-voxel character (the agent) works alone at a desk; app windows float up from the monitor one after another and show each step of the job happening for real, while big two-to-three-word captions with one orange word tell the story.',
      'late-night desk setups lit by a monitor; "my AI works while I sleep" reels; screen-recording walkthroughs of a tool doing a job step by step; pixel and voxel avatars.'
    ),
    `## 1. Essence, and what it is not

- **One room, one worker**: a dark desk under a window with the moon, a monitor, a phone on a stand and a keyboard. The only character is a small chunky pixel-voxel figure (the agent, or the user's chosen character built from voxels) who sits, types, leans in and reacts. It is night: the monitor is the key light.
- **The process is the story**: every beat is one app window that rises out of the monitor towards the camera and shows a step **working**: a search with a counter racing up, a grid of results, a ranked table with the winners outlined, a download bar, a transcript typing itself, a timeline cut into labelled blocks, a script being written, a voice waveform, scenes filling a storyboard, a weekly calendar filling with posts. Windows stack and slide away; the room stays.
- **Numbers that move**: counters tick up (3 → 2,411 → 3,754), multipliers pop ("×2", "×8"), progress bars fill, timestamps advance. The viewer must feel the machine running.
- **Captions carry the voice**: two to three words at a time, bold caps, in the lower third over the desk, with **one** word in orange per caption (the verb or the payoff).
- **Stickers for the punchlines**: a tilted orange label with a white outline ("VIRALES", "+120 RULES", "LO MÁS LOCO") slaps onto the window at the key moment.

Not Dark Keynote (there is a room and a character, not a stage of slides), not Voxel Bots Explainer (one worker at a real desk, the UI windows are the heroes, no headline bar), not Desktop Flythrough (we never fly through folders; windows come to us), not a real screen recording (every window is drawn: generic, clean and readable).

## 2. Materials & rendering

- three.js (or the base engine) at 1080×1920 by default (1920×1080 if asked). A long-lens perspective camera (≈ 30° FOV) behind and slightly above the character, so the monitor is at the upper centre and the desk fills the bottom third.
- **Room**: near-black walls (#0a0a0c to #141418), a window with a deep blue night sky, a crescent moon and a few stars; a desk of dark wood or matte black; a mechanical keyboard whose keys catch the monitor light; an optional plant and a lamp that stays off.
- **Character**: built from voxels (boxes with 1 px bevels), 30–40 voxels tall, matte, flat colour per face, a clear silhouette (hair, beard or cap), eyes as dark squares that blink. Contact shadow on the chair and desk.
- **Windows** (2D panels in 3D space, always facing the camera): dark UI (#1a1715 body, #24201d title bar with three dots and a small app name like "content-os · Discoverer"), 10–14 px corner radius, a 1 px warm border, a soft orange glow behind the active one, crisp text. Inside: monospace numbers, tables with hairlines, thumbnails as flat pixel-art faces or abstract blocks (never real people or real logos), waveforms as bars.
- **Light**: the monitor and the active window are the key light (warm white), the window gives a cold blue rim, everything else falls into darkness; a soft bloom on the glowing UI and a faint vignette.
- \`render(t)\` is a pure function of \`t\` (same frame for the same time).

## 3. Colour logic

Near-black room, warm white UI text, **one accent: orange** (#ff7a1a example) for the active outline, the caption key word, the cursor, the stickers and the progress bars; night blue only in the window and the rim light. Green only for a tick "done". Never a second accent.

## 4. Type & subtitles

- Captions: heavy condensed or geometric sans in caps (licence-free, e.g. Archivo Black, Anton, Montserrat ExtraBold), 70–90 px, white with a 4–6 px dark outline and a soft shadow; 2–3 words per caption, one in orange; centred in the lower third, swapped on the word with a 100 ms pop (scale 1.06 → 1).
- UI text: a clean sans (Inter, Manrope) 22–30 px and a monospace (JetBrains Mono, Space Mono) for numbers, counters and file names; tabular numbers.
- Stickers: the caption font on an orange rounded rectangle with a 4 px white outline, rotated −6° to −10°.
- An optional small top title ("TURNO DE MADRUGADA" / "NIGHT SHIFT") in white caps in the first 3 s only.

## 5. Motion quality

Smooth and confident, like a real app. Windows rise from the monitor with a short ease-out (300–400 ms), a slight scale-up and a glow that fades in; the previous window shrinks back and dims. Inside a window something always progresses: rows fill in a stagger (40–60 ms), counters tick with an ease-out, bars fill, text types at reading speed with a blinking orange caret. An orange mouse cursor moves in arcs (never straight lines) and clicks with a small ripple. The character types in bursts, leans in when a number jumps, sits back when a step is done. Idle life: the moon glows, dust drifts in the monitor light, the phone screen lights up now and then.

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Wide on the dark room, the phone lights up with an alarm | it starts on its own | the opening; "every night at 3:55" |
| Slow push over the shoulder to the monitor | it gets to work | the first step |
| Locked on the floating window, tiny drift | look at this step | each step; a number jumping |
| Quick rack focus from window to character | it reacts | a surprising result |
| Pull back to the room with all windows stacked | the whole machine | the ending; "and it did it alone" |

Keep the bottom 20 % for captions. Transitions are windows replacing windows; never cut to another place.

## 7. Sound palette

Night room tone, soft mechanical keyboard bursts, a UI blip when a window opens, fast ticks while a counter climbs, a whoosh when a window slides away, a pop and a short "ding" when a sticker lands, a low riser before the payoff. Use the real effects bank (efectos/) before synthesizing. Music: a dark, steady lo-fi or minimal electronic beat under the voice. Close, confident, slightly hushed voice (it is night). −14 LUFS.

## 8. Native moves

- **The alarm.** The phone lights up at night with a notification ("Night shift · Instagram connected") and the character wakes up. *Fits content like:* the hook; a routine; "while I sleep".
- **The racing counter.** A big number climbs in a corner of the window while results pile up. *Fits content like:* how much it searched; scale; effort saved.
- **The winners table.** A ranked table where the outliers get an orange outline and a "×N" pill. *Fits content like:* choosing the best; data that proves it.
- **The teardown.** A transcript and a timeline cut into labelled blocks (hook, steps, proof, call). *Fits content like:* analysing a video, a document or a process.
- **The calendar.** A week grid filling with thumbnails and ticks. *Fits content like:* the ending; scheduling; consistency.

## 9. Pitfalls of the medium

- Unreadable windows: one idea per window, big numbers, nothing under 22 px. - A static window: something inside must progress every second. - Too many windows at once: the active one plus at most one dimmed behind. - Real people, real handles or real app logos in the windows: draw pixel faces and generic names. - A lit room: keep it dark, the monitor is the light. - Long captions: 2–3 words, one orange.
`,
    ENGINE('brick-toy', "its 3D scene setup, lighting and render loop; replace the studs with plain bevelled voxels, build the dark night room around the desk, light it from the monitor, and render the floating UI windows as camera-facing panels drawn on 2D canvases with a glow, plus the caption and sticker layer on top."),
    `## 11. Variation space

You decide the room details, the character, the app name in the windows, the steps and the numbers. Structures: "it wakes up → searches → picks → takes apart → writes → records → publishes"; one job from request to result; before (the human doing it at 3 AM) and after (the agent doing it alone). Openings: the alarm at night; a counter already racing; the character yawning and cracking its knuckles. Endings: the calendar filling up; a "published" tick and the character going back to sleep; the pull-back to the whole room with the windows stacked.
`
  ].join('\n'),

  'kywai-countdown-list': [
    HEAD(
      'Countdown List',
      'A rapid-fire numbered list against the clock: a big title with "in under 30 seconds", a two-column list from 1 to N that fills in one item per second or two with the current one in orange, a red seven-segment LED stopwatch racing, and for every item a small before/after panel that shows the idea working.',
      'speed-run listicles; "20 principles in 30 seconds" reels; digital stopwatches and LED timers; side-by-side before/after UI demos.'
    ),
    `## 1. Essence, and what it is not

- **The list is the timeline**: the title ("20 principles of X") and a numbered list in two columns (1–10, 11–20) stay at the top the whole film. Items appear one by one, exactly when said; the current item is orange, the previous ones turn white, the coming numbers wait empty.
- **Against the clock**: a red seven-segment LED stopwatch (00.00, with a dark unlit-segment ghost) runs on the left side and never stops until the last item, where it freezes and blinks. The subtitle under the title promises the limit ("in under 30 seconds").
- **One proof per item**: in the lower half, a white card with a one-line rule on a black strip ("Things squish on impact to show weight") and two panels side by side labelled **Before** and **After**, each with a tiny looping demo of the same UI element done badly and well (a button that squashes, a card that follows through, a hit area that grows, a list that chunks a number). The card changes with every item.
- **Fast but readable**: 1–2.5 s per item; the voice says only the name of each item; the panel and the strip carry the explanation.
- If a presenter is wanted, a robot of kywai (or the chosen character) talks in the middle band; otherwise the middle is a soft gradient.

Not Checklist (no ticking boxes and no slow progress; it is a race with a stopwatch), not Swiss Motion Design (warm, product-like cards, a physical timer), not App Promo (it teaches a list, it does not sell a product).

## 2. Materials & rendering

- Canvas or SVG at 1080×1920 by default (1920×1080 if asked, list on the left, card on the right). Background: a soft blurred room-like gradient (warm grey to beige) with gentle grain, or the middle band with the presenter.
- **Title block**: top 22 %, centred; title 56–64 px white with a soft shadow, subtitle 26–30 px at 70 % white; the list below in two columns, 26–32 px, with numbers right-aligned.
- **Stopwatch**: a dark rounded rectangle with a red seven-segment display (lit #ff2a2a with a glow, unlit segments at 8 %), "SS.CC" format, on the left at about 40 % height, 18–22 % of the width.
- **Proof card**: white (#ffffff) with 18–24 px radius and a soft shadow, lower 40 % of the frame; the rule strip is black with white bold text (24–28 px) across the top; two panels on a faint dot grid with "Before / After" labels (bold) and a grey sublabel ("Rigid" / "Squash & stretch").
- Demos inside panels are simple flat UI pieces (buttons, cards, inputs, toasts, menus) in 2–3 muted colours plus the accent; each loops every 1–1.5 s so both sides are seen at least once.
- \`render(t)\` is a pure function of \`t\` (same frame for the same time).

## 3. Colour logic

White text over the soft background, **orange** (#ff8a3d example) only for the current list item and the key part of each "After" demo, **red** only for the LED stopwatch, black and white for the proof card. The "Before" panel is greyer and flatter; the "After" panel gets the accent.

## 4. Type & subtitles

- Title and list: a clean geometric or grotesque sans (licence-free, e.g. Inter, Manrope, Space Grotesk), title bold, list medium, numbers tabular.
- Rule strip: bold, sentence case, ≤ 50 characters.
- Subtitles: usually none (the list is the subtitle); if the voice says more than the item name, a small caption pill above the card with ≤ 30 characters.

## 5. Motion quality

On ones, brisk. A new item types or fades in from the left in 120 ms and turns orange; the previous one fades to white. The proof card swaps with a quick vertical slide (180 ms) or a flip; its demos start immediately. The stopwatch counts in real time (hundredths) and pulses slightly on every new item. At the end the stopwatch freezes, blinks twice, and the whole list glows once. The "After" demos must apply what they teach (squash and stretch, anticipation, follow-through, arcs, easing).

## 6. Camera grammar

| Move | What it expresses | Can serve |
|---|---|---|
| Locked frame, everything visible | the race | the whole film |
| Tiny push on the card at item changes | this one now | each item |
| Quick zoom on the stopwatch | time is running | the hook; the last item |
| Pull back with the full list lit | done | the ending; "save this" |

Keep it simple: the frame barely moves; the content changes.

## 7. Sound palette

A fast ticking under everything, a soft click or blip on every new item, a short whoosh on card swaps, a buzzer or bell when the stopwatch stops. Use the real effects bank (efectos/) before synthesizing. Music: none or a quiet driving beat. A fast, clear voice that reads only the item names, one breath per item. −14 LUFS.

## 8. Native moves

- **The race starts.** The stopwatch at 00.00 starts on the first word of the title. *Fits content like:* the hook; "in under 30 seconds".
- **Before / After.** Two panels with the same element done badly and well. *Fits content like:* each rule, principle, tip or law.
- **Column jump.** At item 11 the list jumps to the second column with a small flash. *Fits content like:* the halfway point; "and the other 10".
- **Time!** The stopwatch freezes and blinks, the list glows. *Fits content like:* the ending; the call to action ("comment X and I send you the full list").

## 9. Pitfalls of the medium

- Too slow: more than 3 s per item breaks the promise. - Explaining in the voice: the voice names, the card explains. - Panels too small or busy: one element per panel, big. - A demo that does not loop in time: each one must be understood in about one second. - Real app logos in the demos: generic UI only.
`,
    ENGINE('swiss-motion', "its grid, typographic timing and sound-event helpers; build the two-column numbered list, the seven-segment LED stopwatch (draw each segment as a bevelled polygon), the white proof card with the black rule strip and the two looping Before/After demo panels on top, warmer and softer than the Swiss look."),
    `## 11. Variation space

You decide the number of items (5 to 20), the time limit, the background or presenter, and the demos. Structures: "N principles of X in under T seconds"; "N mistakes and their fix" (Before = the mistake); "N tools in N seconds" (Before = without it, After = with it). Openings: the stopwatch already running; the empty list with only numbers; the presenter saying the promise. Endings: "Time!" with the full list; the stopwatch beating the limit by a hair; a comment box offering the full guide.
`
  ].join('\n')
}
