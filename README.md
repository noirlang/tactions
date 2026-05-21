<p align="center">
  <img src="tactions.png" alt="tactions logo" width="120" />
</p>

<h1 align="center">tactions</h1>

<p align="center">
  A sleek, minimalist, and ultra-fast desktop application designed to monitor your GitHub Actions workflows right from your desktop. Built with Rust, Tauri v2, and vanilla frontend technologies.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PRs-welcome-E8E8E8?style=flat-square&labelColor=161616&color=FFFFFF" alt="PRs Welcome" />
  <img src="https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-E8E8E8?style=flat-square&labelColor=161616&color=FFFFFF" alt="Platform Support" />
  <img src="https://img.shields.io/badge/Built%20with-Rust%20%26%20Tauri-E8E8E8?style=flat-square&labelColor=161616&color=FFFFFF" alt="Built with Rust & Tauri" />
</p>

---

## 🎥 Demo

*Add your demo video/animation here!*
<!-- Replace the line below with your video or GIF -->
<p align="center">
  <video src="demo.mp4" width="100%" controls autoplay loop muted></video>
</p>

---

## ✨ Features

- **Monochrome & Minimalist Aesthetic**: A beautiful dark, distraction-free UI tailored for developers.
- **Tauri v2 Native Architecture**: Insanely lightweight footprint and blazing fast performance powered by Rust.
- **Secure Repository Monitoring**: Seamlessly track public and private repositories using native GitHub CLI (`gh`) authentication.
- **Workflow Runs & Jobs Overview**: List runs with live-updating statuses, inspect job steps, and follow build steps in detail.
- **Log Inspection with Error Filter**: Read full console logs with a smart "Errors only" toggle to isolate build failures instantly.
- **Custom Native Titlebar**: Custom drag-region titlebar with integration for close, minimize, and maximize controls.
- **Wayland Support**: Built-in compatibility for Linux Wayland display server environments.

---

## 🛠️ Prerequisites

`tactions` leverages the official GitHub CLI (`gh`) to ensure optimal security, omitting the need to manage personal API tokens manually.

1. **GitHub CLI** must be installed on your machine.
   - [Install GitHub CLI](https://cli.github.com/)
2. Log in to your GitHub account via terminal:
   ```bash
   gh auth login
   ```

---

## 🚀 Getting Started

### Development

Clone the repository and install the dependencies:

```bash
# Install NPM packages
npm install

# Start in development mode
npm run dev
```

> [!NOTE]
> On Linux systems running Wayland, `npm run dev` automatically applies the `WEBKIT_DISABLE_DMABUF_RENDERER=1` workaround to prevent rendering issues in WebKitGTK.

### Build & Package

To bundle `tactions` into a production-ready standalone executable for your operating system:

```bash
npm run tauri build
```

---

## ⚙️ Tech Stack

- **Backend**: Rust, Tauri v2
- **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript
- **API/Engine**: GitHub CLI (`gh`) native bindings

---

<p align="center">
    noirLang
</p>
