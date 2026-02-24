# Even G2 Guitar Tuner

A real-time chromatic guitar tuner built for the [Even Realities G2](https://www.evenrealities.com/) smart glasses. Uses the glasses' built-in microphone to detect pitch and displays tuning information directly on the glasses' green monochrome display.

## Live App

**URL:** [https://comm4nd0.github.io/Even-G2-Guitar-Tuner/](https://comm4nd0.github.io/Even-G2-Guitar-Tuner/)

Scan the QR code below in the Even app to load the tuner on your G2 glasses:

![QR Code](qrcode.png)

## Features

- **Real-time pitch detection** using the YIN autocorrelation algorithm — no external audio libraries needed
- **ASCII gauge display** on the glasses' monochrome green screen showing how sharp or flat you are
- **5 tuning modes:**
  - Standard (EADGBE)
  - Drop D (DADGBE)
  - Half Step Down (Eb Ab Db Gb Bb Eb)
  - Open G (DGDGBD)
  - DADGAD
- **Glasses interaction** — tap the glasses temple or use the R1 ring to cycle tuning modes
- **Median smoothing** — 7-sample frequency history for stable readings

## How It Works

The app runs as a web page loaded by the Even app on your phone. The Even app renders it in a WebView and bridges communication to the G2 glasses over BLE.

```
[Vite Dev Server / GitHub Pages] <--HTTP(S)--> [iPhone WebView] <--BLE--> [G2 Glasses]
```

- **Glasses display:** The Even Hub SDK pushes text to 2 containers on the glasses' 576x288 monochrome green display. An ASCII gauge shows the needle position, with the detected note name, cents offset, and current tuning mode.
- **Audio pipeline:** The glasses microphone captures audio at 16kHz. A 2048-sample ring buffer is fed through the YIN algorithm at ~4Hz to detect the fundamental frequency, which is mapped to the nearest musical note.
- **Phone screen:** Shows connection status only — all tuner interaction happens on the glasses.

## Project Structure

```
Even-G2-Guitar-Tuner/
├── index.html              # Entry point loaded by Even app WebView
├── styles.css              # Minimal phone status styling
├── src/
│   ├── Main.ts             # App bootstrap, audio pipeline, detection loop
│   ├── PitchDetector.ts    # YIN autocorrelation pitch detection
│   ├── TunerEngine.ts      # Note mapping, tuning modes, median smoothing
│   ├── CanvasGauge.ts      # Needle gauge component (unused, for future phone UI)
│   ├── GlassesDisplay.ts   # Even Hub SDK bridge + glasses text rendering
│   └── types.ts            # Shared TypeScript interfaces
├── app.json                # Even Hub app manifest
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite build configuration
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Even Hub CLI](https://www.npmjs.com/package/@evenrealities/evenhub-cli): `npm install -g @evenrealities/evenhub-cli`
- Even Realities G2 glasses + Even app on your phone

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

This starts Vite at `http://0.0.0.0:5173`.

### Generate a QR code for the glasses

In a separate terminal:

```bash
npm run qr
```

The CLI will prompt for your local network IP on first run. Your phone must be on the same Wi-Fi network. Scan the QR code in the Even app to load the tuner.

You can also specify the IP directly:

```bash
evenhub qr --http -i <YOUR_LOCAL_IP> -p 5173
```

### Build for production

```bash
npm run build
```

Output goes to `dist/`. To package as an `.ehpk` for the Even Hub:

```bash
npm run pack
```

## Usage

1. Open the app via QR code in the Even app — the glasses microphone starts automatically
2. Play a guitar string — the ASCII gauge shows how sharp or flat you are
3. Tap the glasses temple or use the R1 ring to cycle tuning modes

### Reading the gauge

The glasses display shows a text-based gauge. All display is in the G2's single green colour.

```
Standard  E  A  D  G  B  E
  ------#------|----------
      A2   -12c  FLAT
```

- `|` marks the center (perfectly in tune)
- `O` appears when you're within ±5 cents (in tune)
- `#` appears when you're more than 5 cents off

## Tech Stack

- **TypeScript** + **Vite** — fast dev server with HMR
- **YIN algorithm** — autocorrelation-based pitch detection with parabolic interpolation
- **Even Hub SDK** (`@evenrealities/even_hub_sdk`) — glasses display and microphone access via BLE bridge

## License

MIT
