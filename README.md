# Even G2 Guitar Tuner

A real-time chromatic guitar tuner built for the [Even Reality G2](https://www.evenrealities.com/) smart glasses. Uses the phone microphone to detect pitch via the Web Audio API and displays a needle gauge tuner on both the phone screen and the glasses display.

## QR Code

![QR Code](qrcode.png)

Scan this QR code in the Even app to load the tuner on your G2 glasses.

## Features

- **Real-time pitch detection** using the YIN autocorrelation algorithm — no external audio libraries needed
- **Needle gauge meter** with color-coded zones (green = in tune, yellow = close, red = far off)
- **5 tuning modes:**
  - Standard (EADGBE)
  - Drop D (DADGBE)
  - Half Step Down (Eb Ab Db Gb Bb Eb)
  - Open G (DGDGBD)
  - DADGAD
- **Dual display** — full UI on the phone, simplified gauge + note info on the glasses
- **Glasses interaction** — tap the glasses temple to cycle tuning modes
- **Graceful degradation** — works as a phone-only tuner if glasses aren't connected

## How It Works

The app runs as a web page served by Vite. The Even app on your phone loads it in a WebView and bridges communication to the G2 glasses over BLE.

- **Phone screen:** HTML/CSS/Canvas renders the full tuner UI with an animated needle gauge, note name, cents offset, and tuning mode selector.
- **Glasses display:** The Even Hub SDK sends a simplified greyscale gauge image and text to 3 containers on the glasses' 576x288 display.
- **Audio pipeline:** The phone microphone captures audio at 48kHz. A 4096-sample buffer is fed through the YIN algorithm every animation frame to detect the fundamental frequency, which is then mapped to the nearest musical note.

## Project Structure

```
Even-G2-Guitar-Tuner/
├── index.html              # Entry point (phone WebView UI)
├── styles.css              # Dark theme, high-contrast styling
├── src/
│   ├── Main.ts             # App bootstrap, audio pipeline, detection loop
│   ├── PitchDetector.ts    # YIN autocorrelation pitch detection
│   ├── TunerEngine.ts      # Note mapping, tuning modes, median smoothing
│   ├── CanvasGauge.ts      # Animated needle gauge for phone canvas
│   ├── GlassesDisplay.ts   # Even Hub SDK bridge + glasses rendering
│   └── types.ts            # Shared TypeScript interfaces
├── app.json                # Even Hub app manifest
├── package.json            # Dependencies and scripts
├── tsconfig.json           # TypeScript configuration
└── vite.config.ts          # Vite dev server configuration
```

## Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [Even Hub CLI](https://www.npmjs.com/package/@evenrealities/evenhub-cli): `npm install -g @evenrealities/evenhub-cli`
- Even Reality G2 glasses + Even app on your phone (for glasses testing)

## Getting Started

### Install dependencies

```bash
npm install
```

### Start the dev server

```bash
npm run dev
```

This starts Vite at `http://0.0.0.0:5173`. Open it in a browser to use the phone UI.

### Generate a QR code for the glasses

In a separate terminal:

```bash
evenhub qr --http -i <YOUR_LOCAL_IP> -p 5173
```

Replace `<YOUR_LOCAL_IP>` with your machine's IP on the same Wi-Fi network as your phone (e.g. `192.168.1.x`). Scan the QR code in the Even app to load the tuner on your glasses.

### Test with the Even Hub Simulator

```bash
npm install -g @evenrealities/evenhub-simulator
evenhub-simulator http://<YOUR_LOCAL_IP>:5173
```

### Build for production

```bash
npm run build
```

Output goes to `dist/`. To package as an `.ehpk` for the Even Hub:

```bash
evenhub pack app.json dist -o guitar-tuner.ehpk
```

## Usage

1. Tap **"Tap to Start"** to enable the microphone
2. Play a guitar string — the needle will show how sharp or flat you are
3. Use the **‹ ›** arrows to switch tuning modes
4. On the glasses, tap the temple to cycle tuning modes

### Reading the gauge

| Zone | Color | Meaning |
|------|-------|---------|
| Center | Green | In tune (within ±5 cents) |
| Middle | Yellow | Slightly off (5–20 cents) |
| Edges | Red | Far off (20–50 cents) |

## Tech Stack

- **TypeScript** + **Vite** — fast dev server with HMR
- **Web Audio API** — microphone capture and audio analysis
- **Canvas 2D** — needle gauge rendering on the phone
- **Even Hub SDK** (`@evenrealities/even_hub_sdk`) — glasses display via text and image containers over BLE

## License

MIT
