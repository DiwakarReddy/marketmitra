// Campaign / message templates by vertical
// These are the starting points; AI customizes per-business

export const REACTIVATION_TEMPLATES: Record<string, Record<string, string>> = {
  dental: {
    hinglish: `नमस्ते {{name}} जी! 🙏 {{businessName}} से Dr. {{ownerName}}।

पिछली बार आप {{lastVisit}} को आए थे। काफ़ी समय हो गया! 🦷

6 महीने में एक बार dental check-up ज़रूरी होता है। इस हफ़्ते अपॉइंटमेंट बुक करें — पहले 10 को ₹500 cleaning discount।

📅 Reply "BOOK" — हम आपको slot बता देंगे।`,
    hindi: `नमस्ते {{name}} जी! 🙏 {{businessName}} से।

पिछली बार आप {{lastVisit}} को आए थे। 6 महीने में एक बार dental check-up ज़रूरी होता है।

इस हफ़्ते अपॉइंटमेंट बुक करें। Reply "BOOK" करें।`,
    english: `Hi {{name}}! It's been a while since your last visit ({{lastVisit}}). Time for a dental check-up?

Book this week at {{businessName}} — Reply "BOOK" to see available slots.`,
  },
  salon: {
    hinglish: `Hi {{name}}! 💇‍♀️ {{businessName}} से।

काफ़ी time हो गया — आपका last visit {{lastVisit}} को था। आपके hair/skin को अच्छी care चाहिए! ✨

इस हफ़्ते book करें — पहले 10 को 20% off on all services।

Reply "BOOK" — slot बता देंगे। 💅`,
    hindi: `नमस्ते {{name}} जी! 💇‍♀️

काफ़ी समय हो गया है। {{businessName}} में इस हफ़्ते आएं — 20% off!

Reply "BOOK" करें।`,
    english: `Hi {{name}}! It's been a while since your last visit. This week at {{businessName}} — 20% off!

Reply "BOOK" to reserve your slot.`,
  },
  clinic: {
    hinglish: `नमस्ते {{name}} जी! 🙏 {{businessName}} से Dr. {{ownerName}}।

आपका last visit {{lastVisit}} को था। Annual health check-up ज़रूरी है।

इस हफ़्ते special package — ₹999 में full body checkup (regular ₹1,800)।

Reply "BOOK" — slot confirm करें।`,
    english: `Hi {{name}}! Annual health check-up due. Special at {{businessName}} this week.

Reply "BOOK".`,
  },
  restaurant: {
    hinglish: `Hey {{name}}! 🍽️ {{businessName}} याद है?

काफ़ी time हो गया — हमने menu में कुछ नए dishes add किए हैं। आइए try करें! 👨‍🍳

This weekend special — आपके लिए 15% off।

Reply "BOOK" — table book करें।`,
    english: `Hey {{name}}! Missing you at {{businessName}}. New menu items + 15% off this weekend.

Reply "BOOK" to reserve.`,
  },
  real_estate: {
    hinglish: `Hi {{name}}! 🏠 {{ownerName}} from {{businessName}}।

आप {{lastVisit}} को हमसे मिले थे — properties देख रहे थे। कुछ नई listings आई हैं आपके budget में।

Coffee पीते हुए discuss करें? Reply "CALL" — हम आपको call back करेंगे।`,
    english: `Hi {{name}}, new property listings in your budget. Reply "CALL" to discuss.`,
  },
  coaching: {
    hinglish: `Hi {{name}}! 📚 {{businessName}} से।

Last batch join किया था आपने। नया batch शुरू हो रहा है — early bird 30% off।

Reply "BOOK" — counselling slot book करें।`,
    english: `Hi {{name}}! New batch starting — 30% early bird off. Reply "BOOK".`,
  },
}

export function getReactivationMessage(vertical: string, language: string, vars: Record<string, string>): string {
  const template = REACTIVATION_TEMPLATES[vertical]?.[language] || REACTIVATION_TEMPLATES[vertical]?.hinglish || REACTIVATION_TEMPLATES.dental.hinglish
  let msg = template
  for (const [k, v] of Object.entries(vars)) {
    msg = msg.replaceAll(`{{${k}}}`, v)
  }
  return msg
}

// Auto-approve rules — when AI can post without human approval
export const AUTO_APPROVE_RULES = {
  maxRecipientsWithoutApproval: 50,
  lowRiskTypes: ['daily_tip', 'reminder', 'confirmation', 'reminder_24h'],
  requireApprovalTypes: ['offer', 'discount', 'reactivation_broadcast', 'ad_copy'],
}