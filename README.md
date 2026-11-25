# Aquestoria

Aquestoria is a gamified, fantasy-themed student assignment tracker and planner. Every assignment is a quest: finish it, earn Gold, and spend the Gold on characters and themes.

You can add assignments from .ics files, copy-paste, or upload a clean syllabus.

## Access

https://www.aquestoria.app/

New accounts get a free trial of 168 consecutive hours (7 days) from sign-up. After that, a one-time payment of $6.99 unlocks Aquestoria permanently. There is no subscription.

## Features

- **Syllabus and .ics import.** Upload a syllabus, paste text, or bring in a calendar file. You check every date before it is added.
- **Quest board.** Every assignment is a quest card with a course, due date and reward.
- **Calendar.** Day, week and month views, plus time blocks you can add to plan your hours.
- **Reminders.** Browser notifications for what is due today, tomorrow and within the hour. They appear while Aquestoria is open in a tab, window or installed app.
- **Reward system.** Finishing a quest earns Gold. Spend it in the Shop on characters and color themes, which are cosmetic only.
- **Accounts and cloud save.** Log in to keep your planner across devices. Without Supabase keys the app runs in local mode, where nothing leaves your browser.
- **Feedback box.** A "Send feedback" link in the footer lets testers report bugs or ideas.

## Built with

- HTML, CSS and vanilla JavaScript (no framework)
- [Supabase](https://supabase.com) for accounts, cloud save and the trial rules
- [Stripe](https://stripe.com) Payment Links for the one-time purchase
- [Netlify](https://www.netlify.com) for hosting and the feedback form

## Project files

| File | What it does |
|---|---|
| `index.html` | The whole app, including the landing page, login screens and dialogs |
| `style.css` | App styling, themes and the calendar look |
| `landing.css` | Styling for the landing page |
| `script.js` | Quests, calendar, shop, characters and icons |
| `account.js` | Login, cloud save, the free trial and the paywall |
| `notify.js` | Due-date reminders |
| `SyllabusParser.js` | Finds assignment names and dates in syllabus text |
| `sw.js` | Small service worker so reminders show as proper notifications |
| `config.js` | The only file to edit to turn on accounts and payments |
| `privacy.html` | Privacy policy |
| `backend/setup.sql` | Database tables, the 168-hour trial and free-access codes |
| `backend/stripe-webhook.ts` | Marks an account as paid when Stripe confirms payment |
| `.github/workflows/keep-alive.yml` | Pings the database twice a week so the free tier does not pause |
| `Assets/` | Logos and character art |

## Running it yourself

Aquestoria is a static site, so you only need a local web server.

1. Open a terminal in the project folder.
2. Run `py -m http.server 8000` (use `python3` on Mac or Linux).
3. Open `http://localhost:8000`.

With `supabaseUrl` and `supabaseAnonKey` left empty in `config.js`, the app runs in local mode. To turn on accounts and payments, follow [SETUP.md](SETUP.md). Notifications and the service worker need https, so test those on the hosted site.

## Free access for testers

To give someone a free account, either set `paid = true` on their profile or create an access code. Both are explained in the `FREE ACCESS` section at the bottom of `backend/setup.sql`. People redeem a code from the paywall or from Settings.

## Roadmap

- Reminders that work when the browser is closed (push or email)
- More characters and themes, with original art
- A smoother first-time setup

## Credits

Paper background art by LCSkeleton / Robin Norkum. See [CREDITS.md](CREDITS.md).

## Contact

Found a bug or have an idea? Use the Send feedback link on the site, or email savannahk156@gmail.com.
