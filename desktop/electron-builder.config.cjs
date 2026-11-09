/**
 * Configurazione di electron-builder per gli installer di PERSONA.
 *
 * electronDownload.checksums: checksum SHA-256 ufficiali distribuiti con il pacchetto npm "electron"
 * (stessa versione). Senza checksum in linea, electron-builder scarica SHASUMS256.txt dalla release
 * di Electron a ogni build; con questi la verifica resta attiva senza quel download aggiuntivo.
 */
const electronChecksums = require('electron/checksums.json');

module.exports = {
  "appId": "io.github.fopearcano.persona",
  "productName": "PERSONA",
  "copyright": "© fopearcano",
  "directories": {
    "output": "release",
    "buildResources": "build"
  },
  "files": [
    "dist/main.mjs",
    "package.json",
    "!**/node_modules/better-sqlite3/{deps,src}/**",
    "!**/node_modules/*/{test,tests,docs,example,examples}/**",
    "!**/*.{md,map,ts}"
  ],
  "extraResources": [
    {
      "from": "dist/web",
      "to": "web",
      "filter": [
        "**/*",
        "!**/*.map"
      ]
    },
    {
      "from": "dist/drizzle",
      "to": "drizzle"
    }
  ],
  "asarUnpack": [
    "**/node_modules/better-sqlite3/**"
  ],
  "npmRebuild": false,
  "artifactName": "PERSONA-${version}-${os}-${arch}.${ext}",
  "publish": null,
  "linux": {
    "target": [
      {
        "target": "AppImage",
        "arch": [
          "x64"
        ]
      },
      {
        "target": "deb",
        "arch": [
          "x64"
        ]
      }
    ],
    "category": "Office",
    "executableName": "persona",
    "synopsis": "Laboratorio di identità artificiali persistenti",
    "files": [
      "!**/node_modules/better-sqlite3/prebuilds/{darwin,win32,linuxmusl}-*"
    ],
    "syncDesktopName": true
  },
  "deb": {
    "depends": [
      "libnss3",
      "libgtk-3-0",
      "libxss1",
      "libasound2 | libasound2t64"
    ]
  },
  "win": {
    "target": [
      {
        "target": "nsis",
        "arch": [
          "x64"
        ]
      }
    ],
    "files": [
      "!**/node_modules/better-sqlite3/prebuilds/{darwin,linux,linuxmusl}-*"
    ]
  },
  "nsis": {
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "createDesktopShortcut": true,
    "artifactName": "PERSONA-Setup-${version}-${arch}.${ext}"
  },
  "mac": {
    "target": [
      {
        "target": "dmg",
        // Solo Intel: l'installer macOS è costruito sul runner self-hosted Intel (vedi release.yml).
        "arch": [
          "x64"
        ]
      }
    ],
    "category": "public.app-category.productivity",
    "identity": "-",
    "hardenedRuntime": false,
    "files": [
      "!**/node_modules/better-sqlite3/prebuilds/{linux,linuxmusl,win32}-*"
    ]
  },
  "dmg": {
    "artifactName": "PERSONA-${version}-mac-${arch}.${ext}"
  },
  electronDownload: { checksums: electronChecksums }
};
