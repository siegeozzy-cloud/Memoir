// The Terms and Agreements, shown by TermsDialog when someone signs up.
//
// Kept as plain text in one place rather than as markup, so it can be read, changed and later sent to
// the server as a version without going near the layout. Nothing here is a lawyer's work — it says
// plainly what Memoir does with what you give it, and what its admins will and won't do.

/** Bumped whenever the wording below changes in a way people should see again. */
export const TERMS_VERSION = '2026-11-03'
export const TERMS_UPDATED = '3 November 2026'

/**
 * Where to reach the admins. Change this to the address you want people writing to — it is shown to
 * everyone who reads the terms, so it should be one meant for the purpose, not a private inbox.
 */
export const TERMS_CONTACT = 'the admin who invited you'

export type TermsSection = { heading: string; body: string[] }

export const TERMS: TermsSection[] = [
  {
    heading: '1. What Memoir is',
    body: [
      'Memoir is a place to keep photos and notes from where you have been, pin them to a globe, and share them with the people you have added as friends. Using it means you agree to what is written here.',
    ],
  },
  {
    heading: '2. Who can use it',
    body: [
      'You need to be at least 13 years old, and old enough under the law where you live to agree to terms like these. One account is for one person — do not sign in as someone else or hand your account over.',
      'You add people as friends by asking, and they decide. Nobody can see your posts or message you until you have both agreed.',
    ],
  },
  {
    heading: '3. Your email address and your password',
    body: [
      'Your email address is never shown on your profile, never shown to other members, and is never sold, published or passed to anyone outside Memoir. It is used to sign you in, to confirm that the address is yours, and to send you a link if you forget your password.',
      'Your password is not stored. What is stored is an Argon2id hash of it, which cannot be turned back into the password — so nobody, admins included, can read or recover it. If you forget it, you are sent a link to set a new one.',
      'Keeping your own password to yourself is your side of this. If you think someone else has it, change it: doing so signs out every other device at once.',
    ],
  },
  {
    heading: '4. Calls go straight between devices',
    body: [
      'Voice and video calls are peer-to-peer: the picture and sound travel directly between the two devices, and are not recorded or kept by Memoir. The server only helps the two devices find each other, and knows that a call happened, not what was said.',
      'Where a direct path cannot be made — some office and mobile networks block it — the call is passed through a relay so it can still connect. The relay carries the call on without storing it.',
      'Because a call is a direct connection, the other person\'s device may see your IP address, as it would in any call app. Only call people you have added as friends.',
    ],
  },
  {
    heading: '5. What the admins can see',
    body: [
      'Admins can see the server logs, your messages, your photos, your albums and the places you have pinned. This is simply true of any server you store things on, and it is said plainly here rather than left for you to discover.',
      'That access is for running Memoir — fixing what is broken, restoring something lost, keeping the service up, and dealing with a report of abuse. It is not used to snoop, to build a profile of you, to train anything, to advertise to you, or to show your content to anyone it was not shared with.',
      'Nothing of yours is sold, rented or handed to another company. If a court or the law required it, that would be the one exception, and you would be told where it is allowed.',
    ],
  },
  {
    heading: '6. Harassment and what other people do',
    body: [
      'Memoir does not control what other members say or send. The admins are not responsible or liable for harassment, abuse, threats, unwanted contact or anything else that comes from another member.',
      'What you can do: remove a friend, which stops them reaching you, and report them to an admin. Reports are looked at, and an account can be suspended or removed over them — but no promise is made about what action is taken or how quickly.',
      'If something crosses into a crime or a real threat to someone\'s safety, take it to the police as well. Memoir is not a substitute for that.',
    ],
  },
  {
    heading: '7. Nothing to pay',
    body: [
      'Memoir is free. The admins will never ask you for money, card details, a bank account, a subscription, a fee to unlock a feature, or a payment of any kind — not by email, not in a message, not in the app.',
      'Treat any such request as a scam, whoever it appears to come from, and tell an admin.',
    ],
  },
  {
    heading: '8. Your memories stay yours',
    body: [
      'What you upload is yours. By putting it on Memoir you allow it to be stored, resized and shown back to you and to the friends you shared it with — which is what is needed to run the service, and nothing more. No ownership passes to Memoir.',
      'Photos are shrunk and stripped of their hidden data, including the GPS location the camera recorded, before they are stored. The place a post shows is the one you chose, not the one your camera saved.',
    ],
  },
  {
    heading: '9. What is not allowed',
    body: [
      'Do not upload anything illegal, anything sexual involving children, or anything that threatens or incites violence.',
      'Do not post pictures of other people who have not agreed to it, impersonate someone, or claim an account is run by a person or organisation it is not.',
      'Do not try to break into other accounts, scrape the service, overload it, or get around its limits.',
      'An account used for any of these can be suspended or removed without notice.',
    ],
  },
  {
    heading: '10. Deleting things, and leaving',
    body: [
      'A deleted post goes to Recently Deleted for 30 days, where you can bring it back, and is then removed for good.',
      'You can deactivate your account, which hides it until you sign in again, or delete it outright. Deleting removes your posts, messages and pictures. Copies may remain in backups for a short while before they are overwritten, and a message you sent to someone else stays in their conversation.',
    ],
  },
  {
    heading: '11. Memoir is provided as it is',
    body: [
      'This is a small service, run without any guarantee that it will be available, that nothing will be lost, or that it will keep running at all. Keep your own copies of anything you would be sorry to lose.',
      'As far as the law allows, the admins are not liable for lost data, lost time, or any loss that follows from using or not being able to use Memoir.',
    ],
  },
  {
    heading: '12. If these terms change',
    body: [
      'They may be updated. When something changes that you should see, you will be asked to read and agree again the next time you sign in. Carrying on using Memoir after that means you accept the new version.',
    ],
  },
  {
    heading: '13. Getting in touch',
    body: [
      `To report someone, ask what is held about you, or have your account removed, contact ${TERMS_CONTACT}.`,
    ],
  },
]
