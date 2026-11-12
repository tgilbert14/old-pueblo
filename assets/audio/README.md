# Soundscape sources

Every weather, wind, crowd and firework sound began as a real field recording.
No generative audio is used. Two of the review mixes (B and C, below) add one
synthesized element, a tone bed written in code, and it is labelled as such. The hosted MP3 files are trimmed, level-matched
derivatives made for this scroll story; attribution is included even where the
license does not require it.

| Web asset | Source recording | Recordist | Place | License | Edit |
|---|---|---|---|---|---|
| `story-soundtrack.mp3` | All field recordings listed below | Listed below | Arizona-led composite | Source licenses below | 55.4 s mastered Play soundtrack; includes a natural 3 s finale tail |
| `dawn-bed.mp3` | [Summer Dawn Birds, Phoenix Arizona](https://freesound.org/people/zidzid/sounds/395319/) | zidzid | Phoenix, Arizona | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 14–46 s excerpt, 2 s circular crossfade |
| `monsoon-bed.mp3` | [Thunderstorm, Phoenix AZ](https://freesound.org/people/zidzid/sounds/397785/) | zidzid | Phoenix, Arizona | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 40–72 s excerpt, 2 s circular crossfade |
| `kitt-bed.mp3` | [Wind blowing in the bush on the top of Kitt Peak mountain](https://freesound.org/people/felix.blume/sounds/135193/) | Félix Blume | Kitt Peak, Arizona | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 48–80 s excerpt, 2 s circular crossfade |
| `stadium-bed.mp3` | [Stadium Crowd](https://freesound.org/people/stomachache/sounds/274516/) | stomachache | Sports stadium | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 0–8 s excerpt, 1 s circular crossfade |
| `crowd-swell.mp3` | [College Football Game.wav](https://freesound.org/people/timmyg62/sounds/328623/) | timmyg62 | Big Ten college football game | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 39.2–46.8 s indistinct crowd excerpt |
| `thunder-roll.mp3` | [Thunder](https://www.nps.gov/media/video/view.htm?id=142AF441-6FAB-42B3-A1CE-30733A11DA7B) | National Park Service, Natural Sounds and Night Skies Division | United States | U.S. public domain | 2.5–16.5 s rolling-thunder excerpt |
| `firework-hit.mp3` | [FIREWORKS - 5](https://freesound.org/people/SamuelGremaud/sounds/435729/) | SamuelGremaud | Le Mans, France | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | Complete field recording, tail-shaped for web use |

The dawn and monsoon originals contain the faint city sounds described by their
recordist. The stadium material is deliberately generic: it is not a University
of Arizona broadcast, PA feed, chant, fight song, or game recording. Audio is
silent during scrolling and chapter navigation. The 1.1 MB runtime soundtrack
is requested only after the visitor chooses **Play** with sound enabled.

The runtime master uses equal-power ambience transitions at the story's existing
segment boundaries. Its one-shot events are fixed at 18.70 s (thunder), 43.35 s
(crowd arrival), 48.90 s and 51.08 s (fireworks), followed by a natural fade to
55.4 s. The web encode is 48 kHz stereo at 160 kbps, approximately −22.7 LUFS
integrated with a −2.9 dBTP true peak.

## Review mixes (branch `sound-flow-revamp`, 2026-11-09)

**The page's Play master is now `mixes/story-long.mp3`**: the no-song long-cut mix (`story-nsv6.mp3`) raised 4 dB through a limiter, cut to the 90-second picture. Nobody has listened to it yet. The three 52-second candidates below are kept but no longer played by the page.

Three candidate Play masters live in `mixes/`, built by `tools/sound/build.py`
from the stems above. Each has a measurement receipt beside it (`story-*.json`).
**Nobody has listened to these yet.** The receipts only show loudness, peak and
the absence of holes; whether they sound right is still an open question.

| File | Name | What is in it |
|---|---|---|
| `mixes/story-a.mp3` | Storm spine | Field recordings only. No birds, no music. Kitt Peak wind runs under the whole film; the storm is heard far off from first light, arrives, and thins into the night. |
| `mixes/story-b.mp3` | Dawn chorus, seated | Mix A, plus the dawn birds set back (about 8 dB lower, high end softened, gone by 12.5 s) and the tone bed, quiet. |
| `mixes/story-c.mp3` | Tone led | No birds. The tone bed sits forward and carries the mountain; wind and crowd sit a little lower. |

What changed against the v5.2 master in all three:

- One continuous bed. The Kitt Peak wind plays from the first second to the last, so
  the world no longer restarts at each movement.
- Distance is a low-pass. The storm and the crowd each have a far (low-passed) and a
  near stem, so both approach instead of switching on.
- The NPS thunder roll has a second loud crack 10.5 s in. In v5.2 it landed at 29.2 s,
  on the first frames of the Milky Way. The roll now fades out inside the whiteout.
- The mountain is quiet but not a hole: about -29 LUFS momentary, where v5.2 fell to -37.
- The crowd rises for five seconds before the 43.35 s arrival instead of jumping 12 LU in one.
- All one-shot cue times are unchanged (18.70, 43.35, 48.90, 51.08 s).
- Level matches v5.2: -22.6 LUFS integrated, true peak under -3 dBFS, 48 kHz, 160 kbps.

Honest limits:

- **Second lossy generation.** The original WAV edits are not in this repo, so the mixes
  are built from the hosted MP3 derivatives and encoded again.
- **Whistle removed (2026-11-10).** The stadium recording has a whistle 1.4 to 2.5 s in. The
  builder cuts 1.15 to 2.95 s out before looping, so mixes a, b and c (and the music mixes)
  have no whistle and the crowd loop is 4.9 s. The v5.2 `story-soundtrack.mp3` still has it at 43.4 s.
- **Loops.** The storm and wind beds are 30 s loops and the stadium bed is a 7 s loop,
  so the crowd repeats about twice under the finale. A longer CC0 crowd recording would fix it.
- **The tone bed is synthesized.** `tools/sound/pad.py` renders a few sine partials in D
  (open at dawn, minor under the storm, thin on the mountain, major at kickoff). It is
  not a recording and not AI-generated; the page says so whenever mix B or C is selected.

- **The flame-machine roar in the long cut is synthesized.** `tools/sound/build_long.py` makes it from filtered noise in code; it is not a recording of a flame machine.
