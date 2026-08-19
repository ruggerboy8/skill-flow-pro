// Every word on screen, as data, never baked into art. Mirrors
// docs/archive/features/the-alcan-way-copy.md (the human source of truth). Alcan voice,
// no em dashes. Keys are referenced from scenes.ts.

export const COPY: Record<string, string> = {
  // Beat 1 — Arrival
  'prologue.title': 'The Alcan Way',
  'prologue.subA': 'Follow one family through one visit.',
  'prologue.subB': 'See what they see. Feel what they feel.',
  'prologue.scroll': 'scroll to begin',
  'arrival.insight':
    'This is Jessica, and her son Johnny. They are not relaxed. No family is, not at the start. A waiting room, a stranger about to look in your kid’s mouth, and a five-year-old who would rather be anywhere else. Watch what the next few minutes do with that.',

  // Principle — Own the First Moment
  'own.title': 'Own the First Moment',
  'own.body':
    'Every visit begins with a moment that decides whether a parent can relax or stay on guard. It is not the paperwork. It is the welcome.',

  // Beat 2 — Greeting
  'greeting.dialogue': 'Welcome in, Jessica! And this must be Johnny.',
  'greeting.insight':
    'She stood up. That is the whole thing. Standing up says we are glad you are here before a single form is touched. Jessica just decided she could relax, and that decision happened in about two seconds.',
  'greeting.promove': 'I always stand up and greet every patient and their guardian with a smile.',

  // Beat 3 — Preview the Doctor
  'preview.dialogue':
    'You will be seeing Dr. Patel today. She did her residency at Children’s Hospital in Baltimore. You are going to love her.',
  'preview.insight':
    'A parent walks in not knowing who is about to work on their child. One sentence, and now they do. A stranger just became someone expected. That is one less thing to brace for.',
  'preview.promove':
    'I always preview the patient’s doctor by name and comment specifically on that doctor’s expertise.',

  // Beat 4 — The Handoff
  'handoff.dialogue': 'Hi Johnny! I’m Jordan, and I will be taking care of you today.',
  'handoff.insight':
    'Nobody shouted a name across the room. Someone walked over and knelt down to Johnny’s height. For a second, he was not a chart number, he was a kid being talked to. This is the assistant’s first moment. Every role has one.',
  'handoff.promove': 'I always greet the patient by name, smile with eye contact, and introduce myself by name.',

  // Beat 5 — The Walk Back
  'walkback.insight':
    'Here is the part Johnny was scared of. The hallway to the back, away from the toys, away from Mom’s chair. Every kid feels this walk. What the staff do with the next ten minutes is the whole visit.',

  // Principle — Master the Moves
  'master.title': 'Master the Moves',
  'master.body':
    'Pro Moves are not a compliance checklist. They are the mechanics of a calm visit. Every one of them has a kid on the other side of it.',

  // Beat 6 — Tell, Show, Do
  'tsd.dialogue':
    'See this little mirror? It is just like the one at home, only tiny. I will be gentle. And if you ever need me to stop, just raise your hand and I will pause right away.',
  'tsd.insight':
    'Before anything goes in Johnny’s mouth, he knows what it is, he has seen it, and he gave a nod. The fear drops because the surprise is gone. And that hand he can raise? That is control. Worry drops when you are not trapped.',
  'tsd.promove1': 'I always tell, show, do before performing any action on a patient.',
  'tsd.promove2': 'I tell the patient they can raise their hand to ask me to pause at any time.',

  // Beat 7 — The Warm Handoff (peak)
  'warm.dialogue':
    'Dr. Patel, this is Johnny and his mom Jessica. He is five, upper right today, mentioned a little pain. No changes to his history, and I have taken the X-rays.',
  'warm.dialogue2': 'Hi Johnny. Hi Jessica. Good to meet you both.',
  'warm.insight':
    'No private hallway conference. No can I talk to you outside for a second. The family heard all of it. In the room, they see a team. In the hallway, they wonder what they are not being told. The trust stayed in the room.',
  'warm.promove':
    'I always allow the assistant to formally present the patient and guardian to me before beginning the exam.',

  // Beat 8 — Ask Before Telling
  'ask.dialogue': 'Before we talk about any plan, what matters most to you about Johnny’s care here?',
  'ask.insight':
    'She asked before she told. Jessica came in ready to defend what matters to her. She did not have to. She was asked first. Now the plan gets built around her answer instead of around a script.',
  'ask.promove':
    'I always ask parents what matters most to them about their child’s dental care before discussing treatment.',

  // Principle — Be the Reason
  'reason.title': 'Be the Reason',
  'reason.body':
    'Be the reason they did not have to worry. Be the reason a kid left excited instead of scared. Not the team. You.',

  // Beat 9 — The Blanket
  'blanket.dialogue': 'Here, this will keep you cozy.',
  'blanket.insight':
    'The reason is not always dramatic. Sometimes it is a blanket. Sometimes it is letting a kid touch the mirror before anything starts. Small things that land because someone was paying attention.',
  'blanket.promove': 'I always offer parents a coffee and patients a blanket prior to all procedures.',

  // Beat 10 — The Seam
  'seam.dialogue':
    'Johnny did awesome today. We did a cleaning, a couple of X-rays, and one little filling up top. Maria at the front will get your next visit set for about six months out.',
  'seam.dialogue2': 'If you have a second, we would love a quick Google review on your way out.',
  'seam.insight':
    'There is no checklist item for this walk. Just a person deciding the space between the back and the front desk still counts as care. The handoff between two people is exactly where families get dropped, or don’t. Nobody let go of them. And the review they will write later? It starts right here, with someone who earned the ask.',
  'seam.promove':
    'I always request that families leave us a Google review after their appointment, and direct them to the QR code.',

  // Beat 11 — The Goodbye
  'goodbye.dialogue': 'Thanks so much, Jessica. Johnny, you were a rockstar. See you in August!',
  'goodbye.insight':
    'They came in braced. They are leaving with Johnny waving over his shoulder. That is what Jessica will remember. Not the filling. The fact that she did not have to worry about a single part of it.',
  'goodbye.promove': 'I always call the guardian and patient by their preferred name.',

  // Beat 12 — The Review
  'review.text':
    'I always dreaded taking my son to the dentist. Not here. The assistant who took him back knelt right down to his level and showed him everything before she did it. Dr. Patel actually asked me what I wanted for him before she said one word about treatment. Johnny walked out asking when he gets to come back. We are not going anywhere else.',
  'review.insight':
    'Every line of that review traces back to a specific person making a specific choice. The kneel. The mirror. The question. Not the team. You.',
  'review.challenge': 'At the end of your next shift, ask yourself one thing. Was I someone’s reason today?',

  // Beat 13 — Send It
  'recap.title': 'The Alcan Way',
  'recap.own': 'Own the First Moment. Be fully present from the very first second.',
  'recap.master': 'Master the Moves. Every Pro Move has a patient on the other side of it.',
  'recap.reason': 'Be the Reason. Take it personally.',
  'sendit.role': 'Your first moment is happening tomorrow. Do you know which one it is?',
  'sendit.share': 'You probably just pictured someone who is always the reason. Send this to them.',
}
