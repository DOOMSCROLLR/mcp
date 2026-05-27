import { z } from "zod";

export const instagramAdObjectiveSchema = z.enum([
  "subscriber_capture",
  "product_sales",
  "event_rsvp",
  "waitlist",
  "app_installs",
  "brand_awareness",
]);

export const instagramAdToneSchema = z.enum([
  "direct",
  "luxury",
  "playful",
  "editorial",
  "urgent",
  "educational",
  "anti_algorithm",
]);

export const instagramAdPackSchema = {
  brand_name: z.string().min(1).describe("Creator, brand, product, or campaign name"),
  offer: z.string().min(1).describe("What the ad is promoting"),
  audience: z.string().min(1).describe("Target audience or customer segment"),
  destination_url: z.string().url().describe("Landing page or DOOMSCROLLR URL for the ads"),
  objective: instagramAdObjectiveSchema.default("subscriber_capture").describe("Primary campaign objective"),
  tone: instagramAdToneSchema.default("direct").describe("Creative tone"),
  budget_level: z.enum(["test", "growth", "scale"]).default("test").describe("Recommended spend posture"),
  source: z.string().optional().describe("Optional product notes, page copy, creator notes, or source text"),
};

export type InstagramAdPackInput = {
  brand_name: string;
  offer: string;
  audience: string;
  destination_url: string;
  objective: z.infer<typeof instagramAdObjectiveSchema>;
  tone: z.infer<typeof instagramAdToneSchema>;
  budget_level: "test" | "growth" | "scale";
  source?: string;
};

function compactWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return compactWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "campaign";
}

function withUtm(destinationUrl: string, campaign: string, content: string): string {
  const url = new URL(destinationUrl);
  url.searchParams.set("utm_source", "instagram");
  url.searchParams.set("utm_medium", "paid_social");
  url.searchParams.set("utm_campaign", campaign);
  url.searchParams.set("utm_content", content);
  return url.toString();
}

function ctaForObjective(objective: InstagramAdPackInput["objective"]): string {
  const ctas: Record<InstagramAdPackInput["objective"], string> = {
    subscriber_capture: "Sign Up",
    product_sales: "Shop Now",
    event_rsvp: "Reserve",
    waitlist: "Join Waitlist",
    app_installs: "Install Now",
    brand_awareness: "Learn More",
  };
  return ctas[objective];
}

function outcomeForObjective(objective: InstagramAdPackInput["objective"]): string {
  const outcomes: Record<InstagramAdPackInput["objective"], string> = {
    subscriber_capture: "owned subscribers",
    product_sales: "buyers",
    event_rsvp: "RSVPs",
    waitlist: "qualified waitlist signups",
    app_installs: "installs",
    brand_awareness: "high-intent visitors",
  };
  return outcomes[objective];
}

function toneModifier(tone: InstagramAdPackInput["tone"]): string {
  const modifiers: Record<InstagramAdPackInput["tone"], string> = {
    direct: "plain and conversion-focused",
    luxury: "spare, premium, and restrained",
    playful: "fast, weird, and shareable",
    editorial: "tasteful and magazine-like",
    urgent: "time-sensitive without sounding cheap",
    educational: "clear and proof-led",
    anti_algorithm: "independent and platform-aware",
  };
  return modifiers[tone];
}

export function createInstagramAdPack(input: InstagramAdPackInput) {
  const brand = compactWhitespace(input.brand_name);
  const offer = compactWhitespace(input.offer);
  const audience = compactWhitespace(input.audience);
  const objective = input.objective ?? "subscriber_capture";
  const tone = input.tone ?? "direct";
  const budgetLevel = input.budget_level ?? "test";
  const outcome = outcomeForObjective(objective);
  const cta = ctaForObjective(objective);
  const campaign = `${slugify(brand)}-${slugify(objective)}`;
  const source = input.source ? `Source detail to weave in: ${compactWhitespace(input.source)}` : "Use the landing page and offer as the factual source.";

  const adCopy = [
    {
      name: "Direct conversion",
      primary_text: `${brand} is turning ${audience} attention into ${outcome}. ${offer}. Built to capture the people who actually care, not just the people who scroll past.`,
      headline: offer,
      call_to_action: cta,
    },
    {
      name: "Problem aware",
      primary_text: `Your audience should not disappear after one post. ${brand} gives ${audience} a direct path from interest to action: ${offer}.`,
      headline: "Own the next step",
      call_to_action: cta,
    },
    {
      name: "Proof led",
      primary_text: `${offer}. A ${toneModifier(tone)} way for ${audience} to move from Instagram attention into a place ${brand} owns, tracks, and can activate again.`,
      headline: "From reach to owned demand",
      call_to_action: cta,
    },
    {
      name: "Taste signal",
      primary_text: `${brand} is not building another link in bio. It is building a sharper destination for ${audience}: ${offer}, captured with first-party data from the start.`,
      headline: "A better home for the people who get it",
      call_to_action: cta,
    },
    {
      name: "Retargeting angle",
      primary_text: `Still thinking about ${brand}? Start with ${offer}. We will keep the signal clean so the next drop, send, or event gets smarter.`,
      headline: "Come back for the signal",
      call_to_action: cta,
    },
  ];

  return {
    campaign_name: campaign,
    objective,
    ad_copy: adCopy,
    creative_concepts: [
      {
        format: "reel",
        name: "Scroll stop to owned action",
        hook: `POV: ${audience} finally get a real destination, not another temporary post.`,
        visual_direction: "Fast cuts from social post, comment/DM interest, landing page, signup, then a clean graph or segment view.",
        script_or_overlay: [
          "Stop losing the people who actually care.",
          offer,
          `${brand} captures the signal behind the scroll.`,
          "Tap through and join the owned list.",
          source,
        ],
      },
      {
        format: "story",
        name: "Two tap capture",
        hook: `For ${audience}: this is the shortest path from curiosity to access.`,
        visual_direction: "Full-screen product or world screenshot, one strong line, native CTA sticker position left clear.",
        script_or_overlay: [
          offer,
          "Built for the people who want the next thing before the algorithm shows it to everyone.",
          "Tap to get access.",
        ],
      },
      {
        format: "feed",
        name: "Static proof card",
        hook: `${brand}: social attention should become owned demand.`,
        visual_direction: "Square or 4:5 graphic with one hero screenshot or product photo, black/white/blue DOOMSCROLLR treatment, no soft gradient.",
        script_or_overlay: [
          "Attention is not an asset until you can reach it again.",
          offer,
          "Capture. Segment. Activate.",
        ],
      },
    ],
    landing_variants: [
      {
        name: "cold_interest",
        url: withUtm(input.destination_url, campaign, "cold_interest_landing"),
        angle: `Explain the offer quickly for ${audience} who have not seen the brand before.`,
        capture_prompt: `Get access to ${offer}`,
      },
      {
        name: "warm_social",
        url: withUtm(input.destination_url, campaign, "warm_social_landing"),
        angle: "Assume they came from Instagram and already understand the vibe. Push faster to capture.",
        capture_prompt: "Join the list before the next post",
      },
      {
        name: "retargeting",
        url: withUtm(input.destination_url, campaign, "retargeting_landing"),
        angle: "Remind visitors what they almost did and reduce friction.",
        capture_prompt: "Save my spot",
      },
    ],
    utm_links: {
      reel: withUtm(input.destination_url, campaign, "reel_scroll_stop"),
      story: withUtm(input.destination_url, campaign, "story_two_tap"),
      feed: withUtm(input.destination_url, campaign, "feed_proof_card"),
      retargeting: withUtm(input.destination_url, campaign, "retargeting_signal"),
    },
    recommendations: {
      campaign_structure: [
        {
          test: "Start with small daily budgets across 3 creative angles. Kill anything with weak landing-page clickthrough or no capture signal after early spend.",
          growth: "Separate prospecting and retargeting. Keep enough budget per ad set to exit learning before judging creative.",
          scale: "Use winning creative as the control, then test hooks and landing variants one dimension at a time.",
        }[budgetLevel],
        "Run one prospecting ad set around interest/lookalike audiences and one retargeting ad set for site or engagement visitors.",
        "Keep organic-looking creative in the mix. Instagram ads that look too polished often lose the creator/culture signal.",
      ],
      targeting: [
        `Start from the stated audience: ${audience}.`,
        "Use owned subscriber/customer tags as seed segments once available.",
        "Create separate UTMs per creative concept so DOOMSCROLLR can score source quality, not just traffic volume.",
      ],
      measurement: [
        "Primary metric: cost per owned conversion, not likes or reach.",
        "Secondary metric: source-tagged subscriber quality, repeat visits, product clicks, RSVP intent, or purchase intent.",
        "Feed winners back into DOOMSCROLLR audience tags so the next campaign improves from first-party data.",
      ],
      guardrails: [
        "This pack does not launch or spend through Meta Ads API.",
        "Review regulated claims, music rights, likeness rights, and platform policy before launch.",
        "Keep one clear conversion action per landing page.",
      ],
    },
    next_steps: [
      "Create or confirm the DOOMSCROLLR landing page for each landing variant.",
      "Generate or upload creative assets in 9:16, 4:5, and 1:1 formats.",
      "Launch manually in Meta Ads Manager or wire a future Meta Ads API tool after account approval.",
      "Read source-tagged conversions back into DOOMSCROLLR before scaling spend.",
    ],
    note: "This tool creates a Meta-ready Instagram ad pack but does not launch ads or spend money.",
  };
}
