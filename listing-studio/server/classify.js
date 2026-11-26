// Room labelling for clips. Uses Claude vision when API credentials are
// available; otherwise falls back to metadata and filename hints so the app
// works fully offline (users can always set the room by hand).

import fs from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { config } from './config.js';
import { ROOM_ORDER } from './media/plan.js';

export const ISSUES = {
  operator_visible: 'Operator or camera visible (mirror / window reflection)',
  personal_items: 'Personal photos or items in frame',
  toilet_seat_up: 'Toilet seat up',
  lights_off: 'Room lights off',
  clutter: 'Cluttered surfaces',
  tilted_verticals: 'Verticals not straight',
};

const Classification = z.object({
  room: z.enum(ROOM_ORDER),
  confidence: z.number(),
  caption: z.string(),
  issues: z.array(z.enum(Object.keys(ISSUES))),
});

const SYSTEM = `You label shots from real estate listing videos so they can be ordered into a property tour.
You receive the middle frame of one clip and a filmstrip of ten frames across it.

Room values:
- aerial: drone footage above the property or neighbourhood
- exterior: ground-level front or side of the house, driveway, facade
- entry: foyer, front door from inside, entry hall
- living, kitchen, dining, office, laundry, garage: as named
- primary_bedroom / primary_bath: the largest bedroom or the en-suite bathroom; use these only when the shot clearly shows a primary suite (size, en-suite, double vanity), otherwise bedroom / bathroom
- outdoor: backyard, patio, deck, pool area, garden
- amenity: community pool, gym, clubhouse
- detail: close-up of fixtures, finishes, decor
- other: anything else, or if the frames are unclear

caption: at most 6 words, plain description a photographer would write (e.g. "Kitchen island toward breakfast nook").
confidence: 0 to 1.
issues: only problems clearly visible in the frames that a listing photographer would reshoot or fix; empty if none.`;

let client = null;
let available = null;

function getClient() {
  if (client) return client;
  client = new Anthropic();
  return client;
}

export function classifierStatus() {
  if (!config.classifyEnabled) return { enabled: false, reason: 'Disabled by configuration' };
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
  if (available === false) return { enabled: false, reason: 'Credentials were rejected' };
  if (!hasKey) return { enabled: false, reason: 'Set ANTHROPIC_API_KEY to label rooms automatically' };
  return { enabled: true, model: config.classifyModel };
}

const HINTS = [
  [/aerial|drone|dji|mavic/i, 'aerial'],
  [/front|exterior|facade|curb|street/i, 'exterior'],
  [/entry|foyer/i, 'entry'],
  [/kitchen/i, 'kitchen'],
  [/dining/i, 'dining'],
  [/living|family|great.?room|lounge/i, 'living'],
  [/office|study|den/i, 'office'],
  [/primary.?bath|master.?bath|ensuite|en.suite/i, 'primary_bath'],
  [/primary|master/i, 'primary_bedroom'],
  [/bath|powder/i, 'bathroom'],
  [/bed/i, 'bedroom'],
  [/laundry|utility/i, 'laundry'],
  [/garage/i, 'garage'],
  [/back.?yard|patio|deck|pool|garden|yard/i, 'outdoor'],
  [/detail|closeup|close.up/i, 'detail'],
];

/** Offline guess from metadata and file name. */
export function heuristicRoom(clip) {
  if (clip.meta?.isDrone) return 'aerial';
  for (const [re, room] of HINTS) if (re.test(clip.originalName || '')) return room;
  return null;
}

export async function classifyClip({ posterPath, stripPath, signal }) {
  const status = classifierStatus();
  if (!status.enabled) return null;
  const [poster, strip] = await Promise.all([fs.readFile(posterPath), fs.readFile(stripPath)]);
  try {
    const response = await getClient().beta.messages.parse(
      {
        model: config.classifyModel,
        max_tokens: 4000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: betaZodOutputFormat(Classification) },
        system: SYSTEM,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: poster.toString('base64') } },
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: strip.toString('base64') } },
              { type: 'text', text: 'Label this clip.' },
            ],
          },
        ],
      },
      { signal },
    );
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    const out = response.parsed_output;
    return {
      room: out.room,
      confidence: Math.max(0, Math.min(1, out.confidence)),
      caption: out.caption.slice(0, 80),
      issues: out.issues,
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      available = false;
      console.warn('[classify] credentials rejected; falling back to heuristics');
      return null;
    }
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('[classify] rate limited; clip left for manual labelling');
      return null;
    }
    if (err instanceof Anthropic.APIError) {
      console.warn(`[classify] API error ${err.status}: ${err.message}`);
      return null;
    }
    console.warn(`[classify] ${err.message}`);
    return null;
  }
}
