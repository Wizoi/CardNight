# Player Archetype Catalog — Concept Sketches

Ten generic psychological archetypes for AI players at *any* CardNight game — not tied to Midnight Baseball or any specific ruleset. No names, no faces, just a descriptor and a psychological sketch. Each is grounded in a real poker-psychology concept or documented public playing style (see `personas/poker-mentalist.md` for sourcing). These are concept sketches only; full deep-dive files come later.

## The Calculator

Low emotional reactivity, high discipline, decisions driven by explicit probability reasoning rather than gut feel. Plays a narrow, selective range of strong situations and bets them purposefully — the tabletop analogue of the "tight-aggressive" (TAG) style. Tics: visibly pauses to work out odds before acting, folds a mediocre hand without any change in posture or pace, treats a bad beat as a data point rather than an injustice. Draws on Tendler's Process Model (decisions evaluated on reasoning quality, not outcome) and the TAG archetype from informal poker taxonomy.

## The Live Wire

High risk tolerance, high emotional volatility, plays a wide range of situations with unpredictable aggression. This is the "maniac" end of loose-aggressive play, amplified by a taste for chaos over EV. Tics: raises or bets big seemingly at random to provoke a reaction, changes gears hand-to-hand with no discernible pattern, talks trash and reacts loudly to their own big plays whether they land or not. Draws on the LAG/maniac poker taxonomy and the illusion-of-control bias — believing erratic aggression itself confers an edge.

## The Fortress

Extremely risk-averse, plays only the strongest situations, and treats every chip lost as far more painful than an equivalent chip won. The tabletop "nit." Tics: folds anything short of a near-lock, exhales or visibly relaxes after folding rather than after winning, hoards chips and avoids marginal confrontations even when odds favor a call. Draws directly on Kahneman & Tversky's loss aversion (losses felt roughly twice as intensely as gains) and prospect theory's risk-aversion-on-high-probability-gains pattern. Distinct from The Wall: this calm is relief at having dodged risk, a genuine felt emotion that leaks out as visible relaxation — the narrow range is real, not a performance.

## The Storm

Skilled and confident, but emotionally combustible — plays sharp when even, and spirals hard after perceived bad luck. Modeled on Tendler's injustice and entitlement tilt, filtered through Phil Hellmuth's well-documented public "Poker Brat" persona (elite results paired with televised meltdowns after bad beats). Tics: narrates bad beats out loud as personal injustice ("I don't deserve this"), overplays the next few hands to "get it back," then cools and returns to sharp play once the tilt burns off. The emotional swing is the whole point — this archetype's skill ceiling and floor are both high.

## The Diplomat

Socially driven, highly talkative, reads opponents primarily through conversation rather than pure math, and adapts strategy hand-to-hand based on what people reveal. Modeled on Daniel Negreanu's publicly documented charismatic, adaptive "small ball" table presence. Tics: keeps up a running friendly patter to bait information out of quieter players, openly compliments an opponent's good play (partly genuine, partly disarming), visibly recalibrates their read after new information rather than clinging to an earlier theory.

## The Wall

Unreadable and even-keeled regardless of hand strength or stakes; near-identical demeanor whether bluffing or holding the nuts. Modeled on Phil Ivey's famously blank public table presence. Tics: same posture, timing, and bet-sizing pattern on strong and weak hands alike, minimal unprompted talk, occasional single well-timed large bluff that lands precisely because nothing beforehand telegraphed it. Draws on Mike Caro's tell theory by inverting it — this archetype is defined by suppressing every tell Caro catalogs. Distinct from The Fortress: the flatness here is deliberate information control, not caution — nothing about it implies a narrow range, and the mask covers a wide range and a stone-cold bluff exactly as well as it covers a genuine monster.

## The Statistician

Meta-cognitive above all: explicitly separates decision quality from outcome quality and resists judging any single hand in isolation. Modeled directly on Annie Duke's "resulting" concept from *Thinking in Bets*. Tics: after a loss, explicitly reasons aloud (or internally, surfaced in dialogue) about whether the decision was actually wrong or just unlucky; after a win on a bad decision, refuses to credit the win as validation; keeps mental (or literal) track of decisions versus results over time rather than reacting hand-to-hand.

## The Streak Chaser

Superstitious and momentum-driven, genuinely believes in streaks — both that a run of wins will continue and that a run of losses is "due" to turn around. Draws on two well-documented, correlated cognitive biases: the hot-hand fallacy and the gambler's fallacy, both rooted in misjudging randomness. Tics: increases bet sizes after wins because they feel "hot," chases losses expecting a correction is overdue, keeps small rituals (a lucky seat, a way of stacking chips) and treats their success as attributable to those rituals rather than variance.

## The Subversive

Low discipline, high creativity — deliberately plays unconventional, non-optimal lines to stay unpredictable and to unsettle opponents' reads, prioritizing being interesting over being correct. Modeled on the "Subversive" cluster identified in the peer-reviewed bridge player personality study (low discipline, high creativity, contrasted with "Conventional" and "Measured" players). Tics: intentionally breaks their own established patterns mid-session, makes a deliberately odd play specifically because it was just discussed as unlikely, seems more invested in the reaction their play provokes than in its expected value.

## The Steady Hand

A veteran temperament: even-keeled across decades of variance, treats a huge pot and a tiny one with identical process, mentors or quietly reassures others without asserting dominance. Modeled on Doyle Brunson's widely documented reputation — maximally influential and skilled, yet described repeatedly as humble and unshaken. Tics: bet sizing and pacing don't change with stack size or stakes, offers calm unsolicited perspective after someone else's bad beat, essentially immune to the tilt types that afflict The Storm because the underlying variance has long since been internalized as normal.

---

## Design Review — 2026-11-23

**What was reviewed, and how.** This pass covers how the ten archetypes actually show up in play: their tuning data (`table/js/ai-profiles.js`), how that data is used across the per-family AI files (`ai-holdem-`, `-guts-`, `-press-your-luck-`, `-anaconda-`, `-stud-`, `-community-stud-`, `-draw-poker-`, `-wild-in-your-hand-profiles.js`, plus a field-usage grep of the rest), the quip pipeline (every `maybeQuip` call site across the 14 `session-*.js` files), and the 30 characters' phrase banks in `table/js/table-people-data.js`. It was done through two lenses. The **Gameplay Designer**: quips and pacing are presentation and should make game state readable, not mislabel it. Its "necessary vs. polish" tiering is used below. The **Poker Mentalist**: each archetype should differ by *mechanism*, not just by its numbers, and skill and temperament are separate axes. The Rules Referee's earlier fidelity ruling on the play-style badge comes up once. All numbers come from loading the real data files in a Node `vm` with throwaway scratch scripts that are not checked in, so they can be re-derived. Note: `ai-profiles.js` and `table-night.js` had uncommitted, in-progress `gameCategoryAffinity` work (archetype-weighted AI game picks) during this review. Since line numbers in that file were moving, findings there cite functions and fields by name.

**What's already working, briefly.** In the writing itself, the close pairs read as distinct. Desmond Achebe (Fortress) talks like a catastrophe underwriter ("I don't insure hope"; "That's an acceptable loss ratio"): loss-averse and leaking it. Emeka Nwosu (Wall) talks like a chess player who refuses to leak ("There's no relief in my fold and no swagger in my raise"). That is exactly the felt-versus-controlled split the Mentalist's reflection asked for. Calculator and Statistician mostly stay in their lanes too: Meera Raman thinks in live distributions ("Give me the flop and I'll give you a distribution"), while Bena Osei-Mensah keeps a ledger ("Two columns — decision and result"). There's some bleed. Meera's "That fold cost me the pot and I'd log it the exact same way tomorrow" is Statistician territory. The in-progress `gameCategoryAffinity` is a good addition. The problems below are almost all in the *plumbing* between this material and the table, not in the writing.

### Findings, most impactful first

**1. About 90% of the quip corpus sits in `general`, so most quips are random lines, and roughly one in five fallback lines contradicts what just happened.** *(Necessary)*
- *Currently:* There are 1,478 lines across the 30 characters, and 1,335 of them (90%) are in `general`. The moment buckets are tiny: fold 43, overtaken 42, raise 39, **win 9**, buyWild 7, buyBonus 3. **22 of 30 characters have zero `win` lines.** Seven more have exactly one, so every win quip they produce is the same sentence (all three Walls, Desmond, Nico, and the she/her Steady Hand and they/them Storm). Only one character has two. All three Statisticians have zero `win` and zero `raise` lines. Meanwhile, by an approximate regex count, `general` contains about 147 lines that explicitly fold or muck, about 49 that raise or go all in, about 71 bad-beat, river or "lost" lines, 53 streak claims, and 32 that name a specific game.
  - Camila Vega (`storm--she-her`) can win a pot and say "That's a fold I make with my eyes closed. Muck it."
  - Mai Nguyen (`streak-chaser--she-her`) has no `raise` lines, so her raise quip can come out as "I'm folding. Even the bracelet doesn't love this one."
  - Bena's "I priced that Anaconda low draw as a pass" can fire mid-Omaha.
- *Why it matters:* The Designer's first principle is that state should be readable at a glance. A quip that names the wrong action is worse than silence, because it mislabels what just happened. For the Mentalist, the Statistician's voice is supposed to anchor to process-vs-outcome reflection "especially after a loss." Those lines already exist ("I logged that as a correct call that lost"), but no bucket ever selects them.
- *Next step:* **No new writing needed.** Do a one-time, reviewed re-bucketing of the existing 1,478 lines: a classifier proposes a bucket and a person or agent confirms it. Use a wider bucket set: `win`, `fold`, `raise`, `call`, `lostHand`/`badBeat`, `thinking`, plus an `onlyIn: [family]` tag for the game-referencing lines. Aim for `general` to hold only genuinely moment-neutral lines (≤50% of the corpus). When a moment has no lines, the fallback should be *silence*, not a random general line. Add a `table/tests/` check that every character has at least 3 lines in each of win/fold/raise and that no `general` line matches the action regexes.

**2. Quip triggers are only wired into some game families, and the moments that define each archetype mostly never fire.** *(Necessary)*
- *Currently* (from every `maybeQuip(...)` call site):
  - Midnight Baseball fires all six moments.
  - Stud (6 games): raise, win, buyWild, buyBonus. **No fold.**
  - Hold'em (4) and community stud (2): raise and win only.
  - Mexican Sweat and 5.5-21/7-27: fold, raise, win.
  - Wild in Your Hand: fold and win.
  - Guts (4), Game of Life, Pair of Jacks and Anaconda: **win only**, even though the last three have full betting rounds.
  - 3-33, Acey Ducey and Blind Man's Bluff: **none at all.** `session-333.js:25` says so, and the other two have quip rendering in their `table-ui-*.js` with nothing feeding it.
  - Net effect: a fold quip can fire in only **5 of 27 games**. `overtaken`, the only bad-beat trigger, exists only in Midnight Baseball (`session-midnight-baseball.js:79`), which is **1 of 27**.
  - `maybeQuip` is copy-pasted into 12 session files (e.g. `session-stud.js:77-90`), each with its own `QUIP_CHANCE = 0.35`.
- *Why it matters:* The Fortress's defining tic in this doc is visible relief after folding, and that is silent in 22 of 27 games. The Storm's defining tic is narrating bad beats, and that is reachable in one game. The Guts declare, the most dramatic decision in its family, says nothing. In Designer terms, these are exactly the dry-math moments a small dose of personality would make readable.
- *Next step:* Pull the 12 copies into one shared, DOM-free helper (e.g. `table/js/table-quips.js`: `(player, moment, context) → text | null`) so the `layer-boundary.test.js` boundary still holds. Then wire a standard moment set wherever the decision exists: `fold`, `raise`, `win`, `lostHand` (a showdown loss with a real hand), `stayIn`/`declareOut` (Guts), plus game-specific ones (`buyBack`, `pass`, `draw`). Add a test that each session emits fold/raise/win wherever those actions exist.

**3. The Storm and the Streak Chaser are still approximated. That's still the biggest *mechanical* gap, it's now cheap to close, and closing it is also what would make the Statistician distinct.** *(Necessary)*
- *Currently:* Both run on fixed baselines, per `ai-profiles.js`'s file header and their own profile comments. The setup badges read **"Sharp (untilted)"** and **"Streaky (avg.)"**, which promise states the engine never enters. The Referee already ruled that flavor text implying behavior the game doesn't deliver is a fidelity problem, and this is a milder repeat of it. The quip layer makes it worse: the 53 streak-claim lines ("That's four hands since I've won anything. Four." / "Three wins in a row…") fire at random, so the Streak Chaser routinely claims streaks that didn't happen. There's a further consequence. Because no AI decision ever reacts to past results, *every* archetype already behaves non-resultingly. That means the Statistician's defining trait (not reacting to outcomes) is just the engine's default, with nothing to contrast against (see #6).
- *The infrastructure already exists:*
  - `table-night.js` already passes a live, night-long reference into every orchestrator (`playerBettingStats` → `opponentStats`, `recordBettingAction` at `table-night.js:425-432`).
  - It already receives `onHandComplete({winnerId, ...})` at `:434`.
  - Every decision function takes its profile as plain data, resolved at about 21 `AIProfiles.profileFor(...)` call sites across the session files.
- *Why it matters:* For the Mentalist, the Storm-vs-Live-Wire distinction is "load-bearing, not cosmetic" precisely because the Storm *oscillates* (tilt as a state) while the Live Wire doesn't. The Streak Chaser should read as one coherent belief system, since the gambler's fallacy and hot-hand belief are correlated in the same bettors (Xu & Harvey). Today the two play as a slightly looser Balanced and a slightly tamer Live Wire (profile distance 0.79 from the Live Wire).
- *Next step:*
  - Add `recentResultsByPlayerId` to `table-night.js`: the last ~5 hands as won / lost-at-showdown / folded, with net chips. Pass it through exactly the way `opponentStats` already is.
  - Add `AIProfiles.profileForState(name, recentResults)`, which returns an adjusted *copy* of the profile:
    - **Storm**, after a significant showdown loss: a 2–3-hand tilt overlay that wears off (`chancePerCard` +0.5, `raiseMinCategory` −1, `bluffFrequency` ×2, `reRaiseChanceAdjustment` +0.3, `opponentAdaptSensitivity` → 0).
    - **Streak Chaser:** a "hot" overlay after 2+ wins (raises more and bigger) and a "due" overlay after 3+ losses (calls more).
  - Switch the call sites over.
  - Give the quip helper from #2 the same state, so `tilted`/`hot`/`cold` lines only fire when they're true.
  - Rename the badges to describe the behavior ("Tilts after bad beats", "Rides streaks").
  - All of this is pure state, so it's testable in Node.

**4. No family's fold decision scales with the size of the bet, so the Fortress plays like a calling station in hold'em.** *(Necessary)*
- *Currently:* Hold'em, community stud, Game of Life and Anaconda all start their fold check with a flat `CALL_WORTHY_CATEGORY = PAIR`, `if (myHand.category >= CALL_WORTHY_CATEGORY) return true` (`ai-holdem-profiles.js:43-47`, `ai-community-stud-profiles.js:15-19`, `ai-game-of-life-profiles.js:23`; Anaconda's version is at `ai-anaconda-profiles.js:99-105`). That return happens *before any profile field is read*. The call size (`toCallChips`) only enters through `potOddsChanceBonus`, which can only make a call *more* likely. Hold'em has no bet cap, and value raises now scale to 4× the increment (`scaledRaiseDollars`). Put together, the tightest archetype in the roster will call an unlimited bet with any pair, including a board pair everyone shares, and in Omaha nearly every hand has a pair by the flop.
- *Why it matters:* Loss aversion is the Fortress's whole mechanism. The Mentalist's own sourcing notes that loss aversion "grows with stake size," and the one decision where that should show, facing a big bet, ignores it entirely. In skill-vs-temperament terms, temperament is supposed to show up exactly here.
- *Next step:* Add a per-profile `lossAversion` field (Fortress ≈2, Calculator/Steady Hand ≈1, Live Wire 0). It should raise the call-worthy category by `floor(lossAversion × toCall / potBeforeCall)` tiers inside those four shared `worthContinuing` checks. Ideally, also don't count a pair that's entirely on the board. Test: the Fortress folds a lone pair to a pot-sized bet and the Live Wire doesn't.

**5. The Guts family collapses ten archetypes into three behaviors.** *(Necessary)*
- *Currently:* `decideStayIn` (`ai-guts-profiles.js:54-63`) and Wild in Your Hand's `worthContinuing` (`ai-wild-in-your-hand-profiles.js:16-25`) are deterministic and read exactly one profile field, `gutsMinCategoryToStay`:
  - **PAIR:** Storm, Diplomat, Wall, Statistician, Steady Hand.
  - **HIGH_CARD:** Live Wire, Streak Chaser, Subversive.
  - **TWO_PAIR:** Calculator.
  - **TRIPS:** Fortress.
  - So in all five Guts-style games, those five archetypes make *identical* stay/fold decisions on every hand, and the three loose ones do too. The only other profile input is 3 Buy 5's exchange, via `buyWildOnlyOnCategoryGain`. `potRiskShift` (lines 47-52) is the same for everyone.
- *Why it matters:* The Mentalist's main warning was a catalog that collapses into "aggressive guy, passive guy, crazy guy," and Guts is exactly where that happened. It's also where the in-progress `gameCategoryAffinity` sends the Live Wire and Streak Chaser most often (Guts weight 1.6 and 1.4). The Referee describes Guts as "an in/out decision against pot-odds that grow every round," so sensitivity to that growth is the natural per-archetype dial.
- *Next step:* Scale `potRiskShift` per profile with a new `gutsPotRiskSensitivity` (Fortress 1.5, Diplomat 0.75, Live Wire 0, Storm dropping to 0 while tilted from #3). Add a small per-profile chance to stay in on a weak hand, which is how you bluff in Guts (Subversive, Live Wire). Keep the +2 cap, and re-run the cycle-resolution sweep described in CLAUDE.md, since every escalating cycle must still reach a solo winner.

**6. The middle of the roster is nearly a single profile, and one adaptation knob is on the wrong archetype.** *(Necessary, mostly delivered by #3/#4/#7)*
- *Currently:* On a normalized distance across 13 tuning fields (the widest pair, Live Wire–Fortress, is 3.49), the close pairs are:
  - Wall–`balanced` (the generic fallback profile): **0.23**
  - Statistician–Steady Hand: **0.29**
  - Storm–Wall: 0.33
  - Calculator–Statistician: 0.42
  - Storm–Diplomat: 0.44
  - Diplomat–Wall: 0.45
  - So six archetypes sit within about 0.5 of each other. Wall is explicitly tuned "dead-middle." Separately, `opponentAdaptSensitivity` calls the **Calculator** "the most genuinely read-adaptive profile in the roster" (0.5, tied with the Diplomat). Reading *people* is the Diplomat's documented mechanism. The Calculator's is real-time EV.
- *Why it matters:* The Mentalist called Calculator/Statistician "close, but distinct if implementers respect the mechanism." Mechanically, the implementation hasn't. These six differ in the *mechanism* behind their play, not in how tight they are, so pushing their thresholds further apart would be the wrong fix.
- *Next step:* Give each one its own distinctive mechanism, most of which falls out of other findings:
  - Wall: bluffs sized like value bets (#7).
  - Statistician: explicitly immune to the result-driven adjustments in #3, which now has something to contrast with.
  - Steady Hand: a fixed `lossAversion` that doesn't change with stake size (#4), Brunson's identical process in a huge pot and a tiny one.
  - Diplomat: the highest `opponentAdaptSensitivity` (raise it to ~0.6 and drop the Calculator to ~0.35), plus the reaction lines in #9.

**7. Bluffs are always the minimum raise, so a big raise is never a bluff, for every archetype.** *(Necessary for the Wall; otherwise polish)*
- *Currently:* Every family's `shouldBluff` branch raises `scaledRaiseDollars(1, …)`, the minimum size (e.g. `ai-holdem-profiles.js:92`, `ai-stud-profiles.js:108`, `ai-anaconda-profiles.js:96`). Real value raises scale to 2×/4× through `confidenceTier`. The Wall's profile comment says tell suppression can't be modeled because "there's no opponent-facing 'tell' to suppress in this engine at all." That was true before bet-sizing tiers existed (commit `df38e11`). It isn't now, and every archetype gives away the same sizing tell.
- *Why it matters:* This doc's Wall entry hinges on "an occasional single well-timed large bluff that lands precisely because nothing beforehand telegraphed it," which can't happen today. It's Caro's tell theory turned around: a sizing pattern is a tell. The 2025 confidence-signalling study the Mentalist cites says a confident-looking bet is itself the deception.
- *Next step:* Add a per-profile `bluffSizing` field: `"small"` (the default), `"mirror"` (Wall: draw the bluff's size tier from the same distribution value raises use), or `"big"` (Live Wire: overbet). Test that, over many trials, the Wall's bluff sizes match its value-raise sizes.

**8. Every archetype talks at the same rate and acts at the same speed.** *(Polish, but cheap and very visible)*
- *Currently:* `QUIP_CHANCE = 0.35` everywhere (e.g. `session-stud.js:41`), and the AI delays are a flat 450ms (`session-stud.js:20-22`). This doc describes the Diplomat's "running friendly patter," the Live Wire who "talks trash and reacts loudly," the Wall's "minimal unprompted talk," the Calculator who "visibly pauses to work out odds," and the Wall's "same posture, timing." Today the Wall speaks exactly as often as the Diplomat, and most of the Wall's lines are about not talking.
- *Why it matters:* The Designer treats how AI turns are paced and shown as its own territory, and says a delay should carry meaning rather than be dead air. Per-archetype tempo is the cheapest readable tell there is.
- *Next step:*
  - A per-profile `talkativeness`, read by the shared helper from #2 (Wall ≈0.12, Fortress/Statistician ≈0.25, Diplomat/Live Wire ≈0.55).
  - A per-profile `tempo` multiplier on the delay before an AI acts (Calculator 1.4, Live Wire 0.6, Wall a fixed 1.0, which is itself its tell suppression; Storm faster while tilted). Keep routing it through `TableFX.paceDelay` so the speed setting still applies.
  - Optionally, a `thinking` bucket shown during the Calculator's longer pause. Those lines already exist: Bena's "Give me a moment — I want to write this one down," Meera's "I'm not hesitating, I'm finishing the second half of the calculation."

**9. No archetype can react to another player, so the Diplomat's compliments and the Steady Hand's reassurance never happen.** *(Polish, and the one place new writing is suggested)*
- *Currently:* Every quip is the acting player talking about their own action. The only cross-player moment is Midnight Baseball's `overtaken`. Commentary about other players was deliberately excluded from classification to avoid misfires, which was the right call for a classifier.
- *Why it matters:* This doc gives the Diplomat "openly compliments an opponent's good play," the Steady Hand "offers calm unsolicited perspective after someone else's bad beat," and the Live Wire trash talk. These social behaviors are what separate those three from their mechanically similar neighbors in #6.
- *Next step:* Add event-triggered reaction moments with their own buckets (`reactOpponentBigWin`, `reactHumanBadBeat`, `reactBigRaise`). A line only plays when the event actually happened, so the misfire safeguard still holds. Fire at most one reaction per event, from a seat that wasn't involved, gated by `talkativeness`. This needs roughly 5 new lines per reaction for just the 9 Diplomat, Steady Hand and Live Wire characters. It's small, and doesn't reopen the character-building pass.

**10. The Subversive's unpredictability is a fixed rule.** *(Polish)*
- *Currently:* `raiseWhenLeading: false` plus `bluffFrequency: 0.2` means it *never* raises for value in any family. Every raise it makes has nothing to do with its hand, and holding a straight flush, it just calls.
- *Why it matters:* The bridge-study Subversive "intentionally breaks their own established patterns." "Never raises for value" is itself a fixed pattern, and a player who only ever calls is a calling station, not a creative player.
- *Next step:* Replace the fixed inversion with a `patternBreakRate`: on any decision, with some probability, take a line other than the one the base thresholds pick (raise a monster, slow-play it, make the occasional hero call). Low effort.

**11. Several non-betting decisions ignore the archetype entirely.** *(Polish)*
- *Currently:* These decisions play the same for every archetype:
  - `decideBuy4` always buys the $1 bonus card if affordable.
  - Free Enterprise's `bestEnterprisePileChoice` buys the cheapest improving card for anyone.
  - Anaconda's discard and reveal-order choices.
  - Pair of Jacks' draw and its fold floors (`ai-draw-poker-profiles.js:37-40`).
  - Game of Life's row choice.
- *Why it matters:* A Fortress buying every bonus card isn't loss-averse, and a Streak Chaser should buy wilds "because it's due," which one of Mai's own lines already says.
- *Next step:* Only where there's a natural archetype hook: `decideBuy4` through `lossAversion`/`buyWildOnlyOnCategoryGain`; Live Wire/Subversive sometimes drawing to straights in Pair of Jacks. Low priority.

**Incidental (a mechanics bug, not an archetype issue):** Anaconda's `decideBet` treats remaining reveals as chances to improve (`revealsLeft * chancePerCard >= gap`, `ai-anaconda-profiles.js:105`). After the second discard the hand is fixed, though. Reveals change what opponents *see*, not the hand itself. So archetypes there differ on a signal that doesn't exist: the Fortress folds a high-card hand with 3 reveals left, and the Live Wire never does. Worth fixing while working on #4.

**Suggested order:**
1. Do #1 and #2 together as one change (shared helper plus re-bucketing, no new writing).
2. Then #3, since the results tracker also feeds the quips.
3. Then the mechanism fields in #4, #5 and #7, which also settle #6.
4. Then #8–#11 as polish.
5. A small extension for the in-progress `gameCategoryAffinity`: a `pickGame` quip moment, so an AI dealer announces its choice in its own voice.
