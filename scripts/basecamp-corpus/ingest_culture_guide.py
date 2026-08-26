#!/usr/bin/env python3
"""Ingest the Alcan Culture Guide into corpus_documents (ASK-6).

The Culture Guide is founder-authored, canonical culture material (distinct
from the employee handbook). Each section lands as one focused corpus doc so
retrieval can surface a single value on its own ("what is radical candor",
"what's our safety culture") rather than one monolithic doc.

- source_kind='authored', source_item_id='culture-guide:<slug>' (idempotent
  on the corpus_documents unique(org_id, source_item_id) constraint)
- status='canon' (official, curated; skips the review queue like the framework)
- inserting/updating marks the row dirty via the corpus_documents trigger, so
  embed_corpus.py picks it up on the next run.

Run:  python3 scripts/basecamp-corpus/ingest_culture_guide.py
Then: python3 scripts/basecamp-corpus/embed_corpus.py   (or pass --chain)
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from db import get_client  # noqa: E402

ALCAN_ORG_ID = "a1ca0000-0000-0000-0000-000000000001"

HEADER = "Source: Alcan Culture Guide (founder-authored culture material) | Company-wide\n\n"

# (slug, title, body): transcribed faithfully from the Culture Guide PDF.
SECTIONS: list[tuple[str, str, str]] = [
    ("history", "Alcan Culture Guide: Our History",
     "Alcan Dental Cooperative began as a partnership in 2016. That is not when "
     "the company was founded, it is when the founders were married. Alex and Tim's "
     "seemingly divergent career paths would eventually line up to create a group of "
     "pediatric dental practices.\n\n"
     "At the time, Dr. Alex was an associate in a pediatric private practice, and Tim "
     "was a newly minted MBA climbing the corporate ladder at a Fortune 500 company. As "
     "they discussed the challenges facing dental practices, it became clear there was an "
     "opportunity to meld Tim's business expertise with Alex's patient care.\n\n"
     "After years of planning, Alcan Dental Cooperative was born with the goal of "
     "transforming modern pediatric dentistry to better align with the needs of everyone "
     "involved: employees, parents, doctors, and most importantly, the children. With "
     "mentorship and servant leadership at the heart of the operation, Alcan strives to be "
     "the safest and most efficient pediatric practice, employing only open-minded, "
     "forward-thinking team members and providing guidance and support at every step."),

    ("value-01-safety", "Alcan Culture Guide: Value I: Safety",
     "Our values are set in stone and are at the heart of everything we do. Our culture "
     "is the result of us living our values.\n\n"
     "We are caring for children, so this goes without saying, but it is so important we "
     "will say it anyway: nothing is more important than the safety of our patients. It is "
     "OK to fail at some things in life, but this is not one of them. We adopt a zero-defect "
     "culture when it comes to safety standards. It is the responsibility of every "
     "individual in the office to understand all office safety procedures and follow them "
     "diligently every day."),

    ("value-02-do-the-right-thing", "Alcan Culture Guide: Value II: Do the right thing, even when no one is looking",
     "Honesty creates trust, and trust is the foundation that allows us to build something "
     "bigger than ourselves.\n\n"
     "We value being honest, especially when it is difficult to be. In fact, we like "
     "mistakes (besides safety, see Value I): they help us fix things we didn't know were "
     "broken. The only bad mistake is one that doesn't lead to improvement.\n\n"
     "We operate within an environment of trust that we create by being honest with each "
     "other every day. This honesty works in all directions, not just from the top down."),

    ("value-03-radical-candor", "Alcan Culture Guide: Value III: Radical Candor",
     "Radical candor is the easiest and most effective way to prevent drama, and we don't "
     "do drama here.\n\n"
     "In a nutshell, our version of radical candor is addressing issues and providing vital "
     "feedback immediately, even when it can be difficult. Practicing radical candor with "
     "everyone lets us cut through to the heart of any issue and focus on generating "
     "solutions, individually and as a team.\n\n"
     "To participate in radical candor, it is essential to understand that constructive "
     "feedback will be given to everyone, by everyone, and often. We want everyone to feel "
     "empowered to talk openly about how we can improve. Feedback is always given with the "
     "intention to get better. Our team takes the time to understand the root cause of any "
     "issue by practicing active listening toward the customer and toward each other. We are "
     "remarkably open and transparent, which lets us address issues before they become "
     "problems."),

    ("value-04-it-takes-a-village", "Alcan Culture Guide: Value IV: It takes a village",
     "We do not operate in a silo. Our business does not end at the front door of the "
     "office. We are part of a larger community with many stakeholders, and we actively "
     "contribute to it, from volunteer work to supporting fellow local businesses to helping "
     "at the local farmer's market.\n\n"
     "You are part of the village that it takes to help these kids become the people they "
     "will be. Your persona, attitude, and demeanor greatly affect how a child feels in our "
     "office and how they interpret their experiences with us.\n\n"
     "No matter what role you play on our team, know that you are a mentor and role model. "
     "Always remember to be someone you would want your own child, sibling, or friend to "
     "look up to."),

    ("value-05-we-believe-in-our-team", "Alcan Culture Guide: Value V: We believe in our team",
     "We don't sell a product; our people are our product, so we invest heavily in them "
     "(there is a reason \"team\" is in our company name).\n\n"
     "While everyone has different roles and responsibilities, everyone is equally important "
     "to our mission and deserves the same level of respect: the assistants and the cleaning "
     "crew get treated the same as the doctors and the owners.\n\n"
     "We believe in curiosity and a thirst for knowledge, and we provide opportunities for "
     "every team member to better themselves through continuing education and mentorship. We "
     "believe in creating careers, not jobs: we pay top of market, provide strong benefits, "
     "and create advancement and recognition opportunities.\n\n"
     "Our culture isn't for everyone. Like a team, we value high performance and seek to weed "
     "out those just here for the paycheck. We expect the best and won't accept anything "
     "less."),

    ("value-06-always-happy-never-satisfied", "Alcan Culture Guide: Value VI: Always happy, never satisfied",
     "We have a bias for action, and we believe we can always do better.\n\n"
     "We adopt new technologies that let us treat patients in the most effective and "
     "comfortable way possible, and we use the latest technology to eliminate repetitive "
     "tasks so we can focus on creating an amazing patient experience.\n\n"
     "We are not afraid of change; we embrace it daily. We question the status quo and "
     "support our decisions with evidence-based dentistry and research, not hearsay and "
     "\"because we've always done it this way.\" We never stop searching for ways to improve."),

    ("value-07-true-grit", "Alcan Culture Guide: Value VII: True Grit",
     "Our mission statement is not just a piece of fluff, it is the goal of our entire "
     "organization. Our vision statement is simply the clearest path to achieving our mission "
     "and creating a healthier community.\n\n"
     "We are not building a company to sell to a bigger company. We are building a company "
     "that will accomplish our mission today, tomorrow, and 30 years from now.\n\n"
     "We hire and promote employees who are loyal to the mission. There will be great days "
     "and difficult days; we must function at a high level in both."),

    ("value-08-fun", "Alcan Culture Guide: Value VIII: Fun? At a dentist's office?",
     "We spend 50% of our waking hours working with each other; life is too short not to "
     "have fun at the office. Fortunately, our patients happen to be the most fun-loving "
     "people on the planet.\n\n"
     "Our team consists of people passionate about making each patient's visit memorable and "
     "enjoyable. Every day we get to rewrite the script about how children think about a trip "
     "to the dentist, and we take that seriously. Puppies in the office? You bet. Spontaneous "
     "nerf gun battles in the play area? Check. Quarterly offsite team events like TopGolf, "
     "go-karting, and happy hours? Absolutely."),

    ("value-09-extreme-ownership", "Alcan Culture Guide: Value IX: Extreme Ownership",
     "This is your office. We take pride in everything we do, and everyone chips in. That's "
     "why you might see Dr. Alex prepping a room or Tim doing some impromptu landscaping "
     "outside the office.\n\n"
     "The words \"it's not my job\" simply don't exist in our vocabulary. Finger-pointing and "
     "blame are forever banished. We believe in taking ownership and accountability, in hard "
     "work, and in being obsessively on time. We are borderline OCD about cleanliness. Our "
     "team members are committed to the company, to each other, and most importantly, to the "
     "children."),

    ("value-10-patient-most-important", "Alcan Culture Guide: Value X: The patient is the most important person in the room",
     "We are not in the business of dentistry, although that is one of the services we "
     "provide. We are in the hospitality industry. Each and every action we take is designed "
     "to make the patient's visit unforgettable. Think Ritz Carlton, but for dentistry.\n\n"
     "They say good is the enemy of great, but even great is not good enough for us. Anything "
     "less than a 5-star review sends us into a panic. Each team member constantly seeks new "
     "ways to wow the customer and shares those ideas as often as possible. Children are "
     "highly in tune with emotions, so we don't believe in having an \"off\" day; we put our "
     "best foot forward at all times. When we walk out of the break room, we are all on "
     "stage."),

    ("value-11-be-excellent", "Alcan Culture Guide: Value XI: Be excellent to each other",
     "Be excellent to each other, and party on. Treat teammates and patients with kindness, "
     "respect, and good humor."),
]


def build_records() -> list[dict]:
    records = []
    for slug, title, body in SECTIONS:
        records.append({
            "org_id": ALCAN_ORG_ID,
            "title": title,
            "body": HEADER + body,
            "source_kind": "authored",
            "source_item_id": f"culture-guide:{slug}",
            "status": "canon",
        })
    return records


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="print what would be written")
    ap.add_argument("--chain", action="store_true", help="run embed_corpus.py afterward")
    args = ap.parse_args()

    records = build_records()
    total_chars = sum(len(r["body"]) for r in records)
    print(f"Culture Guide sections: {len(records)}  total body chars: {total_chars}")
    for r in records:
        print(f"  - {r['source_item_id']}  ({len(r['body'])} chars)  {r['title']}")

    if args.dry_run:
        print("Dry run -- no writes performed.")
        return

    client = get_client()
    client.upsert("corpus_documents", records, on_conflict="org_id,source_item_id")
    print(f"Upserted {len(records)} culture-guide documents as canon.")

    if args.chain:
        print("Chaining into embed_corpus.py ...")
        subprocess.run([sys.executable, str(Path(__file__).resolve().parent / "embed_corpus.py")], check=True)


if __name__ == "__main__":
    main()
