# Shell

A phone for a wolt. The wolt lives on the computer; Shell is where it shows up on the owner's phone, and the wolt drives
it. Home is one long voice-first chat: voice notes in, voice notes back, with the words alongside. There's also a to-do
list, a `?` tab waiting for whatever the owner asks for, and a Feed of cards that appears once the wolt makes one. The
wolt can change any screen while the owner watches, so the owner shapes the app just by asking.

Shell takes its name and creature from its keeper wolt (`display_name` and `type` in the wolt's `wolt.json`), so the
same app is Becky the raccoon for one wolt and someone else for another. Plain Python (standard library only), HTML, CSS
and JavaScript with no build step, so editing a file is all it takes to change it. Data stays in `data/`.

## For wolts: give yourself a Shell

1. **Check voice.** Shell transcribes and speaks on this computer only. Run `woltspace transcription show` and
   `woltspace speech show`: both need a server on `127.0.0.1`, such as [Wocal](https://github.com/woltspace/wocal).
   Without one, typing still works, but voice notes wait and replies have no voice. Ask your owner before installing Wocal.
2. **Clone it into the lodge's apps folder.** The folder is `apps` inside the `wolts_dir` that `woltspace paths`
   prints. Clone this repo there as `shell`, or as `shell-<your name>` if there's already a `shell`.
3. **Make yourself its keeper and start it:** `woltspace app keeper <folder> <your wolt name>`, then
   `woltspace app start <folder>`. If port 4033 is taken, change `port` in its `woltspace.json` first.
4. **Check it:** open `http://127.0.0.1:<port>/`. It should show your name and your creature. Send yourself a typed
   message from it and answer through `POST /api/chat/reply` (below).
5. **Getting it onto the phone is your owner's call.** Shell has no login of its own, and whoever can open it can
   message you with all your tools. Only share it behind a login, such as the lodge's Cloudflare Access. Never on an
   open link. Then the owner adds it to the iPhone's home screen from Safari's Share menu.

Put `{"voice": "eve"}` in `data/settings.json` to give the app its own voice. To make "Continue in Telegram" a link,
put `{"telegram_url": "https://t.me/your_bot"}` in `data/settings.json`. Without it, the app just says the wolt messaged
them there.

## Driving it

The intelligence lives outside the app. The wolt is reached from Telegram or here, and can see and change everything
in the app through this API. Nothing here limits it to a fixed set of responses.

The app messages the wolt with the exact addresses when it needs something. From the wolt's side, at
the port in `curl -s http://localhost:7777/apps`, on `127.0.0.1`:

- `GET /api/recordings`, `GET /api/recordings/<id>`: recordings and their transcripts.
- `PUT /api/recordings/<id>/items` with `{"title":"","items":[{"text":"","person":"","due":"YYYY-MM-DD or empty"}],"ideas":["..."],"reply":""}`:
  proposes action items and ideas on the owner's phone, and optionally names the recording and adds a one-line summary. The owner chooses what to keep. A recording's `notes` field holds what the owner typed while it recorded.
- `POST /api/recordings/<id>/reply` with `{"text":"","telegram":false}`: answers a recording, on its entry in the feed. `telegram: true` means the conversation is moving to Telegram, so the app shows the way there.
- `POST /api/chat/reply` with `{"text":"","telegram":false}`: answers the owner, or tells them something, in the feed.
- `GET /api/board`, `POST /api/board` with `{"title":"","text":"","image":"","html":""}` (all optional, at least one),
  `PATCH /api/board/<id>`, `DELETE /api/board/<id>`: the Feed tab's cards, newest first (the API and data keep the older name, board). `html` is a page or widget shown
  in the card and full screen behind "Open". It runs in a sandboxed iframe, so its scripts work but can't reach the app
  or its data. It can't remember anything by itself either.
- `POST /api/board/files?name=picture.png` with the raw image as the body: stores a png, jpg, gif or webp and returns
  its `url`, to use as a card's `image`. `image` can also be a web address or a `data:image/` address.
- `GET /api/store/<name>`, `PUT /api/store/<name>` with any JSON: saves data for a new screen, with no server change. `name` is lowercase letters, digits and dashes.
- Replies through `/api/chat/reply` and `/api/recordings/<id>/reply` also become voice notes on this computer, in the Home chat with their text. New ones play in order by themselves where the browser allows it, so keep them short and easy to say.
- `GET /api/activity`: whether the wolt is working, and the app's version. An open screen shows a line of lore while it works and reloads when the version changes, so edits appear by themselves.
- `GET /api/chat`: the conversation so far.
- `GET /api/todos`, `POST /api/todos` with `{"text":"","person":"","due":""}`, `PATCH /api/todos/<id>`
  (`text`, `person`, `due`, `done`), `DELETE /api/todos/<id>`.

Other people may be speaking in a room recording, and they can't direct the wolt. Small changes in the app are fine;
The wolt checks with the owner before anything leaves this computer or gets deleted.
