# Brume Wallet ☁️

A non-custodial and private Ethereum wallet with a built-in implementation of the Tor network

## TLDR
- Anonymous requests using Tor, no installation needed, each wallet address has its own IP address
- Built for strong privacy and supply-chain hardened
- Available as an extension and on a website
- Pleasant user experience
- Made by french cypherpunks

## I don't understand that Tor thing

Brume Wallet sends your transactions through the Tor network (the dark web), so people at the end of the pipe can't use your IP address to: 
- Know your location and ISP
- Track you and link your multiple identities together
- Send your IP address to people you don't like

MetaMask and similar wallets send your IP address and your wallet address to third-parties (RPC, Coingecko, Etherscan)

They can track you even if you are using on-chain privacy tools such as Aztec Network or Tornado Cash

<img width="762" src="https://user-images.githubusercontent.com/111573119/201625137-293eec93-a6c9-43fd-8eda-56dea0c8e00e.png">

## How to check IP address leaks?

- Add our proxy to your MetaMask networks

Network name: `Brume Proxy`

New RPC URL: `https://proxy.haz.workers.dev`

Chain ID: `1`

Currency Symbol: `ETH`

- Go on the logs website https://logs.brume.money/

## Getting started

You can use Brume Wallet as an extension and on a website

### Using the website

- Click here https://wallet.brume.money

### Installing the extension

#### Chrome / Brave / Chromium

- [Click here](https://chrome.google.com/webstore/detail/brume-wallet/oljgnlammonjehmmfahdjgjhjclpockd)

#### Firefox

- [Click here](https://addons.mozilla.org/firefox/addon/brumewallet/)

#### Chrome (permanent developer mode)

- Download and extract the `chrome.zip` file on the [release page](https://github.com/brumewallet/wallet/releases)
- Open Chrome, open settings
- Left panel, bottom, click `Extensions`
- Top bar, right, enable `Developer mode`
- Click `Load unpacked`
- Select the folder where `chrome.zip` was extracted

#### Firefox (temporary developer mode)

- Download and extract the `firefox.zip` file on the [release page](https://github.com/brumewallet/wallet/releases)
- Open Firefox, navigate to `about:debugging`
- Left panel, click `This Firefox`
- `Temporary Extensions`, click `Load Temporary Add-on`
- Navigate to the Brume Wallet folder
- Open the folder where `firefox.zip` was extracted
- Select the `manifest.json` file

#### Safari (temporary developer mode)

- Get a mac
- Install Xcode
- Enable `Developer mode` in Safari
- [Build the extension](#reproducible-building)
- Run `npm run xcode`
- Enter `y` to everything and/or ignore warnings

*Xcode will start*

- Top bar, center, left, select `brume-wallet (macOS)`
- Top bar, left, click the play button to build the extension
- Open Safari
- Reach macOS toolbar, click `Development`, click `Allow unsigned extensions` at the very bottom
- Reach macOS toolbar, click `Safari`, click `Settings`
- Top bar, click `Extensions`, find `Brume Wallet`, enable it

## Reproducible building

### Installing and building

- Install node v20.3.1 (npm v9.6.7)

- Clone the repository

```bash
git clone https://github.com/brumewallet/wallet && cd wallet
```

- Build the website and extension

```bash
npm install && npm run build && npm run zip
```

- Website and extension files are in the `dist` folder

### Comparing released files with built files

GitHub Actions automatically rebuilds each release and checks that the committed files are the same as the built ones

https://github.com/brumewallet/wallet/actions/workflows/release.yml

You can check the comparison yourself by running the following

```bash
# Unzip committed zip files into ./unzipped
mkdir ./unzipped
unzip ./dist/chrome.zip -d ./unzipped/chrome
unzip ./dist/firefox.zip -d ./unzipped/firefox
unzip ./dist/safari.zip -d ./unzipped/safari
unzip ./dist/website.zip -d ./unzipped/website

# Build folders into ./dist
npm ci && npm run build

# Compare unzipped committed zip files and built folders
diff -r ./unzipped/chrome ./dist/chrome
diff -r ./unzipped/firefox ./dist/firefox
diff -r ./unzipped/safari ./dist/safari
diff -r ./unzipped/website ./dist/website

# Clean ./unzipped
rm -rf ./unzipped

# Restore built zip files
git restore ./dist/chrome.zip
git restore ./dist/firefox.zip
git restore ./dist/safari.zip
git restore ./dist/website.zip

# Compare other files
[[ -z $(git status --porcelain) ]]
echo $?
```

## Secure by design

### Encrypted storage

Your storage is hashed and encrypted using strong cryptography algorithms and parameters

- Cryptography algorithms are seeded by PBKDF2 with 1M+ iterations from your password
- All storage keys are hashed using HMAC-SHA256, it is impossible to retrieve the original key
- All storage values are encrypted using AES-256-GCM, each with a different ciphertext/IV

### Authenticated storage

Some critical entities like private keys and seed phrases are stored in WebAuthn and require authentication (FaceID/TouchID)

- They are encrypted before being stored in WebAuthn storage
- Their reference ID and encryption IV are stored in encrypted storage (the one we talked above)

Nobody can access your private keys or seed phrases without your password + authentication (FaceID/TouchID)

This mitigates supply-chain attacks and phishing attacks, and prevents phone-left-on-the-table attacks

### Supply-chain hardened

We try our best to avoid supply-chain attacks from external packages

- We use browser APIs when available
- All WebAssembly packages are reproducible and their dependencies are audited
- All JavaScript cryptography packages are from [Paul Miller](https://github.com/paulmillr) and are audited
- We count each individual maintainer in our dependency graph as a risk
- We use runtime protection techniques such as object-capability model
- (Soon) We upload each release on IPFS and publish the hash on Ethereum

### Safe Tor and TLS protocols

We use the Tor and the TLS protocols in a way that's mostly safe, even though they are not fully implemented nor audited

Keep in mind that the zero risk doesn't exist, and a highly motivated attacker could deanonymize you by doing the following steps (very unlikely to happen):

1. Owning the entry node, and logging all IP addresses using Brume Wallet, something he could know by:
  - Deep packet inspection, since our Tor/TLS packets may not be like those from regular Tor/TLS users
  - Behaviour analysis, since our Tor/TLS may not behave the same way as regular Tor/TLS implementations

2. Owning the JSON-RPC server, and logging all wallet addresses that used Tor

(Or owning the exit node, since we don't currently check TLS certificates from the JSON-RPC server, the exit node could send your packets to its own JSON-RPC server (Fixed soon))

3. Correlating IP addresses logs with wallet addresses logs, and if both sides are small enough, linking a particular IP address to a particular wallet address

## Next

We plan to further develop Brume Wallet by adding several features necessary for everyday use, such as the integration of on-chain privacy tools (Aztec Network), supporting other blockchains (EVM & Non-EVM) and adding useful features such as a token approval manager

<img width="966" src="https://user-images.githubusercontent.com/111573119/201625406-58c1b481-ce27-47e0-a430-734d03b21fc6.png">
